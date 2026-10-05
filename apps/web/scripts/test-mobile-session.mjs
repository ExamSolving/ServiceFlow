import assert from "node:assert/strict";
import { moduleLoader, MemoryFirestore, MemoryTimestamp, firestoreMock } from "./helpers/firestore-harness.mjs";

const tests = [];
const test = (name, run) => tests.push({ name, run });
const T = MemoryTimestamp;

// A fake ID token is any JWT-shaped string; the mocked verifier maps it to claims.
const jwt = (name) => `eyJhbGciOiJSUzI1NiJ9.${name}.c2lnbmF0dXJl`;

function fixture() {
  const db = new MemoryFirestore();
  db.seed("organizations/org-a", { name: "Acme Field Services", status: "ACTIVE", ownerUserId: "owner-a" });
  db.seed("organizations/org-b", { name: "Other Co", status: "ACTIVE", ownerUserId: "owner-b" });
  db.seed("organizationSettings/org-a", { organizationId: "org-a", timezone: "Asia/Kolkata", jobNumberPrefix: "JOB" });
  const member = (uid, role, status = "ACTIVE", org = "org-a") => {
    db.seed(`users/${uid}`, { email: `${uid}@acme.example`, displayName: uid.replace("-", " "), isActive: true, defaultOrganizationId: org });
    db.seed(`memberships/${org}_${uid}`, { userId: uid, organizationId: org, role, status, createdAt: T.now(), updatedAt: T.now() });
  };
  member("tech-a", "TECHNICIAN");
  member("tech-new", "TECHNICIAN");
  member("tech-off", "TECHNICIAN");
  member("tech-dup", "TECHNICIAN");
  member("tech-gone", "TECHNICIAN", "SUSPENDED");
  member("disp-a", "DISPATCHER");
  db.seed("technicians/t-a", { organizationId: "org-a", userId: "tech-a", displayName: "Tess Tech", nameSearch: "tess tech", employeeNumber: "TEC-000001", status: "AVAILABLE", version: 1 });
  db.seed("technicians/t-off", { organizationId: "org-a", userId: "tech-off", displayName: "Otto Off", nameSearch: "otto off", employeeNumber: "TEC-000002", status: "INACTIVE", version: 1 });
  db.seed("technicians/t-dup1", { organizationId: "org-a", userId: "tech-dup", displayName: "Dup One", nameSearch: "dup one", employeeNumber: "TEC-000003", status: "AVAILABLE", version: 1 });
  db.seed("technicians/t-dup2", { organizationId: "org-a", userId: "tech-dup", displayName: "Dup Two", nameSearch: "dup two", employeeNumber: "TEC-000004", status: "BUSY", version: 1 });
  // A profile for the same user id in another tenant must never count.
  db.seed("technicians/t-foreign", { organizationId: "org-b", userId: "tech-new", displayName: "Foreign", nameSearch: "foreign", employeeNumber: "TEC-000001", status: "AVAILABLE", version: 1 });

  const claims = {
    [jwt("tech-a")]: { uid: "tech-a", email: "tech-a@acme.example", email_verified: true },
    [jwt("tech-new")]: { uid: "tech-new", email: "tech-new@acme.example", email_verified: true },
    [jwt("tech-off")]: { uid: "tech-off", email: "tech-off@acme.example", email_verified: true },
    [jwt("tech-dup")]: { uid: "tech-dup", email: "tech-dup@acme.example", email_verified: true },
    [jwt("tech-gone")]: { uid: "tech-gone", email: "tech-gone@acme.example", email_verified: true },
    [jwt("disp-a")]: { uid: "disp-a", email: "disp-a@acme.example", email_verified: true },
    [jwt("unverified")]: { uid: "tech-a", email: "tech-a@acme.example", email_verified: false },
  };
  const failures = { [jwt("expired")]: "auth/id-token-expired", [jwt("revoked")]: "auth/id-token-revoked", [jwt("disabled")]: "auth/user-disabled", [jwt("bogus")]: "auth/argument-error" };
  const calls = [];
  const adminAuth = {
    async verifyIdToken(token, checkRevoked) {
      calls.push({ token, checkRevoked });
      if (failures[token]) throw Object.assign(new Error("secret verifier detail"), { code: failures[token] });
      if (!claims[token]) throw Object.assign(new Error("unknown"), { code: "auth/argument-error" });
      return claims[token];
    },
  };
  const logged = [];
  const load = moduleLoader({
    "firebase-admin/firestore": firestoreMock,
    "@/src/lib/firebase/admin": { adminDb: db, adminAuth },
    "@/src/lib/auth/session": { getFirebaseSession: async () => null },
    react: { cache: (fn) => fn },
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
    console: { error: (...args) => logged.push(args), warn() {}, log() {}, info() {}, debug() {} },
  });
  const route = load("src/app/api/mobile/session/route.ts");
  const call = async (authorization) => {
    const headers = new Headers();
    if (authorization !== undefined) headers.set("authorization", authorization);
    const response = await route.GET(new Request("http://localhost/api/mobile/session", { headers }));
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  };
  return { db, calls, logged, call };
}

test("requests without a valid bearer token are refused without touching the database", async () => {
  const f = fixture();
  for (const header of [undefined, "", "Basic abc", "Bearer", "Bearer not-a-jwt", `Bearer ${"a".repeat(9000)}.b.c`]) {
    const result = await f.call(header);
    assert.equal(result.status, 401, String(header).slice(0, 20));
    assert.equal(result.body.code, "UNAUTHENTICATED");
  }
  assert.equal(f.calls.length, 0, "malformed headers never reach the verifier");
  assert.equal(f.db.reads.length, 0);
});

test("expired, revoked and invalid tokens map to distinct 401 codes without leaking details", async () => {
  const f = fixture();
  assert.equal((await f.call(`Bearer ${jwt("expired")}`)).body.code, "TOKEN_EXPIRED");
  assert.equal((await f.call(`Bearer ${jwt("revoked")}`)).body.code, "SESSION_REVOKED");
  assert.equal((await f.call(`Bearer ${jwt("disabled")}`)).body.code, "SESSION_REVOKED");
  const bogus = await f.call(`Bearer ${jwt("bogus")}`);
  assert.equal(bogus.status, 401);
  assert.equal(bogus.body.code, "UNAUTHENTICATED");
  assert.ok(!JSON.stringify(bogus.body).includes("secret"));
  assert.ok(f.calls.every((c) => c.checkRevoked === true), "revocation is always checked");
});

test("unverified emails and unavailable accounts are refused", async () => {
  const f = fixture();
  const unverified = await f.call(`Bearer ${jwt("unverified")}`);
  assert.equal(unverified.status, 403);
  assert.equal(unverified.body.code, "EMAIL_NOT_VERIFIED");
  const suspended = await f.call(`Bearer ${jwt("tech-gone")}`);
  assert.equal(suspended.status, 403);
  assert.equal(suspended.body.code, "ACCOUNT_UNAVAILABLE");
  assert.equal(suspended.body.reason, "MEMBERSHIP_INACTIVE");
});

test("an active technician gets access with their profile and the organization timezone", async () => {
  const f = fixture();
  const result = await f.call(`Bearer ${jwt("tech-a")}`);
  assert.equal(result.status, 200);
  assert.equal(result.cache, "no-store");
  const session = result.body.session;
  assert.equal(session.access, "ALLOWED");
  assert.equal(session.role, "TECHNICIAN");
  assert.equal(session.organization.name, "Acme Field Services");
  assert.equal(session.organization.timezone, "Asia/Kolkata");
  assert.equal(session.technician.id, "t-a");
  assert.equal(session.technician.employeeNumber, "TEC-000001");
  assert.equal(session.technician.status, "AVAILABLE");
  const technicianQuery = f.db.queries.find((q) => q.path === "technicians");
  assert.ok(technicianQuery.filters.some((x) => x.field === "organizationId" && x.value === "org-a"), "profile lookup is tenant-scoped");
});

test("missing, inactive and foreign profiles are reported, and office roles are told to use the web", async () => {
  const f = fixture();
  const missing = await f.call(`Bearer ${jwt("tech-new")}`);
  assert.equal(missing.status, 200);
  assert.equal(missing.body.session.access, "PROFILE_MISSING", "a profile in another tenant doesn't count");
  assert.equal(missing.body.session.technician, null);
  const inactive = await f.call(`Bearer ${jwt("tech-off")}`);
  assert.equal(inactive.body.session.access, "PROFILE_INACTIVE");
  assert.equal(inactive.body.session.technician.displayName, "Otto Off");
  const before = f.db.queries.length;
  const dispatcher = await f.call(`Bearer ${jwt("disp-a")}`);
  assert.equal(dispatcher.body.session.access, "ROLE_NOT_SUPPORTED");
  assert.equal(dispatcher.body.session.role, "DISPATCHER");
  assert.equal(dispatcher.body.session.technician, null);
  assert.equal(f.db.queries.slice(before).filter((q) => q.path === "technicians").length, 0, "no technician lookup for office roles");
});

test("ambiguous technician links and bad settings fail safely", async () => {
  const f = fixture();
  const ambiguous = await f.call(`Bearer ${jwt("tech-dup")}`);
  assert.equal(ambiguous.status, 500);
  assert.equal(ambiguous.body.message, "We couldn’t load your account. Please try again.");
  assert.ok(f.logged.length > 0, "the failure is logged server-side");
  f.db.seed("organizationSettings/org-a", { organizationId: "org-a", timezone: "Mars/Olympus" });
  assert.equal((await f.call(`Bearer ${jwt("tech-a")}`)).body.session.organization.timezone, "UTC");
  f.db.seed("organizationSettings/org-a", { organizationId: "org-b", timezone: "UTC" });
  assert.equal((await f.call(`Bearer ${jwt("tech-a")}`)).status, 500, "settings owned by another tenant are rejected");
});

let failed = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`ok - ${name}`); }
  catch (error) { failed++; console.error(`not ok - ${name}`); console.error(error); }
}
if (failed) { console.error(`Mobile session checks failed: ${failed}/${tests.length}.`); process.exit(1); }
console.log(`Mobile session checks passed: ${tests.length}/${tests.length}.`);
