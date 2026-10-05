import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { moduleLoader, MemoryFirestore, MemoryTimestamp, firestoreMock, commitDate } from "./helpers/firestore-harness.mjs";

const tests = [];
const test = (name, run) => tests.push({ name, run });
const T = (value) => new MemoryTimestamp(value);
const DAY = 24 * 60 * 60 * 1000;
const at = (offset) => T(new Date(Date.now() + offset));
// A fake ID token is any JWT-shaped string; the mocked verifier maps it to claims.
const jwt = (name) => `eyJhbGciOiJSUzI1NiJ9.${name}.c2lnbmF0dXJl`;

function fixture() {
  const db = new MemoryFirestore();
  db.seed("organizations/org-a", { name: "Greenleaf Services", status: "ACTIVE", ownerUserId: "owner-a" });
  db.seed("organizations/org-b", { name: "Other Co", status: "ACTIVE", ownerUserId: "owner-b" });
  db.seed("organizationSettings/org-a", { organizationId: "org-a", timezone: "Asia/Kolkata", jobNumberPrefix: "JOB" });
  const member = (uid, role, org = "org-a") => {
    db.seed(`users/${uid}`, { email: `${uid}@example.com`, displayName: uid, isActive: true, defaultOrganizationId: org });
    db.seed(`memberships/${org}_${uid}`, { userId: uid, organizationId: org, role, status: "ACTIVE", createdAt: T("2026-09-01T00:00:00Z"), updatedAt: T("2026-09-01T00:00:00Z") });
  };
  for (const uid of ["tess", "arjun", "otto"]) member(uid, "TECHNICIAN");
  member("dina", "DISPATCHER");
  member("xena", "TECHNICIAN", "org-b");
  const profile = (id, userId, displayName, status = "AVAILABLE", organizationId = "org-a") =>
    db.seed(`technicians/${id}`, { organizationId, userId, displayName, nameSearch: displayName.toLowerCase(), employeeNumber: `TEC-${id}`, status, version: 1 });
  profile("t-tess", "tess", "Tess Fernandes");
  profile("t-arjun", "arjun", "Arjun Rao");
  profile("t-otto", "otto", "Otto Off", "INACTIVE");
  profile("t-xena", "xena", "Xena Ward", "AVAILABLE", "org-b");
  db.seed("customers/c-1", { organizationId: "org-a", name: "Greenleaf Apartments", customerNumber: "CUS-000001", phone: "+91 98765 43210", isActive: true });
  db.seed("customers/c-x", { organizationId: "org-b", name: "Foreign", customerNumber: "CUS-000009", phone: "+1 555 0100", isActive: true });

  const claims = Object.fromEntries(["tess", "arjun", "otto", "dina", "xena"].map((uid) => [jwt(uid), { uid, email: `${uid}@example.com`, email_verified: true }]));
  claims[jwt("tess-unverified")] = { uid: "tess", email: "tess@example.com", email_verified: false };
  const adminAuth = {
    async verifyIdToken(token) {
      if (!claims[token]) throw Object.assign(new Error("unknown token"), { code: "auth/argument-error" });
      return claims[token];
    },
  };
  const revalidated = [];
  const logged = [];
  const load = moduleLoader({
    "firebase-admin/firestore": firestoreMock,
    "@/src/lib/firebase/admin": { adminDb: db, adminAuth },
    "@/src/lib/auth/session": { getFirebaseSession: async () => null },
    react: { cache: (fn) => fn },
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
    "next/cache": { revalidatePath: (path) => revalidated.push(path) },
    console: { error: (...args) => logged.push(args), warn() {}, log() {}, info() {}, debug() {} },
  });
  const { normalizeRequestTitle } = load("src/features/service-requests/schemas/service-request.schema.ts");
  let sequence = 0;
  const job = (id, changes = {}) => {
    const title = changes.title ?? `Service visit ${id}`;
    db.seed(`jobs/${id}`, {
      organizationId: "org-a", jobNumber: `JOB-${String(++sequence).padStart(6, "0")}`,
      customerId: "c-1", customerName: "Greenleaf Apartments", customerNumber: "CUS-000001",
      serviceTypeId: "s-1", serviceTypeName: "AC service", description: "The bedroom unit is not cooling.", priority: "NORMAL",
      serviceAddress: "12 MG Road, Pune 411001", serviceRequestId: null, assignedTechnicianId: "t-tess", assignedTechnicianName: "Tess Fernandes",
      scheduledAt: null, estimatedDurationMinutes: 60, completedAt: null, status: "ASSIGNED", version: 1, createdBy: "dina",
      createdAt: T("2026-09-20T08:00:00Z"), updatedAt: T("2026-09-20T08:00:00Z"),
      ...changes, title, titleSearch: normalizeRequestTitle(title),
    });
  };
  const routes = {
    list: load("src/app/api/mobile/jobs/route.ts"),
    detail: load("src/app/api/mobile/jobs/[jobId]/route.ts"),
    status: load("src/app/api/mobile/jobs/[jobId]/status/route.ts"),
    notes: load("src/app/api/mobile/jobs/[jobId]/notes/route.ts"),
  };
  const headers = (who, extra = {}) => {
    const result = new Headers(extra);
    if (who) result.set("authorization", `Bearer ${jwt(who)}`);
    return result;
  };
  const answer = async (response) => ({ status: response.status, body: await response.json().catch(() => null), cache: response.headers.get("cache-control") });
  const params = (jobId) => ({ params: Promise.resolve({ jobId }) });
  const post = (who, path, body, contentType = "application/json") => new Request(`http://localhost${path}`, {
    method: "POST", headers: headers(who, { "content-type": contentType }), body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const api = {
    list: async (who) => answer(await routes.list.GET(new Request("http://localhost/api/mobile/jobs", { headers: headers(who) }))),
    detail: async (who, id) => answer(await routes.detail.GET(new Request(`http://localhost/api/mobile/jobs/${id}`, { headers: headers(who) }), params(id))),
    move: async (who, id, body, contentType) => answer(await routes.status.POST(post(who, `/api/mobile/jobs/${id}/status`, body, contentType), params(id))),
    note: async (who, id, body) => answer(await routes.notes.POST(post(who, `/api/mobile/jobs/${id}/notes`, body), params(id))),
  };
  const mobileAudit = () => db.values("auditLogs").filter((entry) => entry.data.metadata?.source === "MOBILE");
  return { db, job, api, revalidated, logged, load, mobileAudit };
}
const move = (to, version, extra = {}) => ({ to, version, requestId: randomUUID(), ...extra });

test("only active technicians with a profile can use the jobs API", async () => {
  const f = fixture();
  f.job("j-1");
  const none = await f.api.list(undefined);
  assert.equal(none.status, 401);
  assert.equal(none.body.code, "UNAUTHENTICATED");
  assert.equal((await f.api.list("tess-unverified")).body.code, "EMAIL_NOT_VERIFIED");
  for (const [who, access] of [["dina", "ROLE_NOT_SUPPORTED"], ["otto", "PROFILE_INACTIVE"]]) {
    for (const result of [await f.api.list(who), await f.api.detail(who, "j-1"), await f.api.move(who, "j-1", move("ACCEPTED", 1)), await f.api.note(who, "j-1", { body: "Hello there", requestId: randomUUID() })]) {
      assert.equal(result.status, 403, who);
      assert.equal(result.body.code, "TECHNICIAN_UNAVAILABLE");
      assert.equal(result.body.access, access);
    }
  }
  assert.equal(f.db.commits.length, 0, "nothing is written for refused callers");
});

test("the list holds only the technician's own open jobs, by visit time, plus recently completed ones", async () => {
  const f = fixture();
  f.job("j-later", { status: "ASSIGNED", scheduledAt: at(2 * DAY) });
  f.job("j-today", { status: "ACCEPTED", scheduledAt: at(2 * 60 * 60 * 1000) });
  f.job("j-unscheduled", { status: "ASSIGNED" });
  f.job("j-hold", { status: "ON_HOLD", scheduledAt: at(-DAY) });
  f.job("j-moving", { status: "RESCHEDULED", scheduledAt: at(3 * DAY) });
  f.job("j-new", { status: "NEW" });
  f.job("j-cancelled", { status: "CANCELLED", scheduledAt: at(DAY) });
  f.job("j-arjun", { assignedTechnicianId: "t-arjun", assignedTechnicianName: "Arjun Rao" });
  f.job("j-foreign", { organizationId: "org-b", customerId: "c-x" });
  f.job("j-done", { status: "COMPLETED", completedAt: at(-2 * DAY) });
  f.job("j-paid", { status: "PAID", completedAt: at(-3 * DAY) });
  f.job("j-old", { status: "COMPLETED", completedAt: at(-10 * DAY) });
  const result = await f.api.list("tess");
  assert.equal(result.status, 200);
  assert.equal(result.cache, "no-store");
  const { jobs } = result.body;
  assert.deepEqual(jobs.open.map((j) => j.id), ["j-hold", "j-today", "j-later", "j-moving", "j-unscheduled"]);
  assert.deepEqual(jobs.done.map((j) => j.id), ["j-done", "j-paid"]);
  assert.equal(jobs.truncated, false);
  const first = jobs.open[1];
  assert.equal(first.customerName, "Greenleaf Apartments");
  assert.equal(first.serviceAddress, "12 MG Road, Pune 411001");
  assert.equal(first.version, 1);
  assert.ok(!("customerPhone" in first) && !("organizationId" in first) && !("titleSearch" in first), "the list carries no phone numbers or server fields");
  const queries = f.db.queries.filter((q) => q.path === "jobs");
  assert.equal(queries.length, 2);
  for (const query of queries) {
    assert.ok(query.filters.some((x) => x.field === "organizationId" && x.value === "org-a"), "tenant-scoped");
    assert.ok(query.filters.some((x) => x.field === "assignedTechnicianId" && x.value === "t-tess"), "own jobs only");
  }
});

test("more than 100 open jobs are cut at 100 and flagged", async () => {
  const f = fixture();
  for (let i = 0; i < 101; i++) f.job(`j-${String(i).padStart(3, "0")}`);
  const { jobs } = (await f.api.list("tess")).body;
  assert.equal(jobs.open.length, 100);
  assert.equal(jobs.truncated, true);
});

test("a job's detail shows the phone only while open, with notes, history and the next moves", async () => {
  const f = fixture();
  f.job("j-1", { status: "IN_PROGRESS", scheduledAt: at(-60 * 60 * 1000) });
  f.db.seed("jobNotes/n-1", { organizationId: "org-a", jobId: "j-1", body: "Gate code 4321", authorUserId: "dina", authorName: "Dina Dispatcher", createdAt: T("2026-09-21T09:00:00Z") });
  f.db.seed("jobNotes/n-2", { organizationId: "org-a", jobId: "j-1", body: "Unit is on the balcony", authorUserId: "tess", authorName: "Tess Fernandes", createdAt: T("2026-09-21T10:00:00Z") });
  f.db.seed("jobNotes/n-x", { organizationId: "org-b", jobId: "j-1", body: "Other tenant", authorUserId: "xena", authorName: "Xena", createdAt: T("2026-09-21T11:00:00Z") });
  const log = (id, action, metadata, time) => f.db.seed(`auditLogs/${id}`, { organizationId: "org-a", actorUserId: "dina", entityType: "JOB", entityId: "j-1", action, metadata, createdAt: T(time) });
  log("a-1", "JOB_CREATED", { jobNumber: "JOB-000001", version: 1 }, "2026-09-20T08:00:00Z");
  log("a-2", "JOB_DISPATCHED", { technicianId: "t-tess", from: "NEW", to: "ASSIGNED", version: 2 }, "2026-09-20T08:05:00Z");
  log("a-3", "JOB_DISPATCHED", { technicianId: "t-tess", from: "ASSIGNED", to: "ASSIGNED", version: 3 }, "2026-09-20T08:06:00Z");
  log("a-4", "JOB_STATUS_CHANGED", { from: "ASSIGNED", to: "ACCEPTED", version: 4, source: "MOBILE", technicianId: "t-tess", actorName: "Tess Fernandes" }, "2026-09-21T08:00:00Z");
  log("a-5", "JOB_STATUS_CHANGED", { from: "ARRIVED", to: "IN_PROGRESS", version: 7, note: "Started" }, "2026-09-21T09:30:00Z");
  const result = await f.api.detail("tess", "j-1");
  assert.equal(result.status, 200);
  const { job } = result.body;
  assert.equal(job.customerPhone, "+91 98765 43210");
  assert.equal(job.description, "The bedroom unit is not cooling.");
  assert.deepEqual(job.moves, [{ to: "COMPLETED", input: "confirm" }, { to: "ON_HOLD", input: "reason" }]);
  assert.equal(job.canAddNote, true);
  assert.deepEqual(job.notes.map((n) => [n.id, n.mine]), [["n-2", true], ["n-1", false]], "newest first, own notes marked, other tenants excluded");
  assert.deepEqual(job.history.map((e) => [e.from, e.to, e.technicianName, e.note]), [
    ["ARRIVED", "IN_PROGRESS", null, "Started"],
    ["ASSIGNED", "ACCEPTED", "Tess Fernandes", null],
    ["NEW", "ASSIGNED", null, null],
  ], "status changes only, newest first; a time-only dispatch is left out");

  f.job("j-done", { status: "COMPLETED", completedAt: at(-DAY) });
  const done = (await f.api.detail("tess", "j-done")).body.job;
  assert.equal(done.customerPhone, null, "no phone once the job is completed");
  assert.deepEqual(done.moves, []);
  assert.equal(done.canAddNote, true);
  f.job("j-cancelled", { status: "CANCELLED" });
  const cancelled = (await f.api.detail("tess", "j-cancelled")).body.job;
  assert.equal(cancelled.customerPhone, null);
  assert.equal(cancelled.canAddNote, false);
  f.job("j-odd", { customerId: "c-x" });
  assert.equal((await f.api.detail("tess", "j-odd")).body.job.customerPhone, null, "a customer from another tenant is never read");
});

test("other technicians' jobs, other tenants' jobs and bad IDs are all simply not found", async () => {
  const f = fixture();
  f.job("j-arjun", { assignedTechnicianId: "t-arjun", assignedTechnicianName: "Arjun Rao" });
  f.job("j-foreign", { organizationId: "org-b" });
  f.job("j-open", { assignedTechnicianId: null, assignedTechnicianName: null, status: "NEW" });
  for (const id of ["j-arjun", "j-foreign", "j-open", "missing", "../j-arjun", "a".repeat(200)]) {
    const result = await f.api.detail("tess", id);
    assert.equal(result.status, 404, id);
    assert.equal(result.body.code, "NOT_FOUND");
    assert.equal((await f.api.move("tess", id, move("ACCEPTED", 1))).status, 404, id);
    assert.equal((await f.api.note("tess", id, { body: "Hello there", requestId: randomUUID() })).status, 404, id);
  }
  assert.equal(f.db.commits.length, 0);
});

test("moves follow the technician's list and the job's version, through to Completed", async () => {
  const f = fixture();
  f.job("j-1");
  const accepted = await f.api.move("tess", "j-1", move("ACCEPTED", 1, { note: "Bringing the ladder" }));
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.job.status, "ACCEPTED");
  assert.equal(accepted.body.job.version, 2);
  assert.deepEqual(accepted.body.job.moves.map((m) => m.to), ["EN_ROUTE", "RESCHEDULED"]);
  const [entry] = f.mobileAudit();
  assert.equal(entry.data.action, "JOB_STATUS_CHANGED");
  assert.deepEqual(entry.data.metadata, { from: "ASSIGNED", to: "ACCEPTED", version: 2, source: "MOBILE", technicianId: "t-tess", actorName: "Tess Fernandes", note: "Bringing the ladder" });
  assert.equal(entry.data.actorUserId, "tess");
  assert.ok(f.revalidated.includes("/protected/jobs/j-1") && f.revalidated.includes("/protected/schedule"), "the office's pages refresh");

  const stale = await f.api.move("tess", "j-1", move("EN_ROUTE", 1));
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "CONFLICT");
  for (const to of ["ARRIVED", "CANCELLED", "REJECTED", "ASSIGNED", "COMPLETED"]) {
    const refused = await f.api.move("tess", "j-1", move(to, 2));
    assert.equal(refused.status, 409, to);
    assert.equal(refused.body.code, "STATE", to);
  }
  let version = 2;
  for (const [to, extra] of [["EN_ROUTE"], ["ARRIVED"], ["DIAGNOSING"], ["IN_PROGRESS"], ["COMPLETED", { note: "Replaced the capacitor" }]]) {
    const result = await f.api.move("tess", "j-1", move(to, version, extra));
    assert.equal(result.status, 200, to);
    assert.equal(result.body.job.status, to);
    version = result.body.job.version;
  }
  const stored = f.db.values("jobs").find((x) => x.path === "jobs/j-1").data;
  assert.equal(stored.status, "COMPLETED");
  assert.equal(stored.completedAt.toDate().toISOString(), commitDate.toISOString());
  assert.equal(stored.assignedTechnicianId, "t-tess");
  const completed = (await f.api.detail("tess", "j-1")).body.job;
  assert.deepEqual(completed.moves, []);
  assert.equal(completed.customerPhone, null);
  // Every write in the harness shares one commit time, so find the entry rather than relying on its position.
  assert.equal(completed.history.find((e) => e.to === "COMPLETED")?.note, "Replaced the capacitor");
  assert.equal((await f.api.move("tess", "j-1", move("INVOICED", version))).body.code, "STATE", "billing stays with the office");
});

test("a retry with the same request ID applies the move once", async () => {
  const f = fixture();
  f.job("j-1");
  const body = move("ACCEPTED", 1);
  const first = await f.api.move("tess", "j-1", body);
  const second = await f.api.move("tess", "j-1", body);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.body.job.status, "ACCEPTED");
  assert.equal(second.body.job.version, 2, "not applied twice");
  assert.equal(f.mobileAudit().length, 1);
  const reused = await f.api.move("tess", "j-1", { ...body, to: "EN_ROUTE", version: 2 });
  assert.equal(reused.status, 409);
  assert.equal(reused.body.code, "CONFLICT", "a request ID can't be reused for another move");
});

test("a decline hands the job back to the office as Rescheduled, without a technician, keeping the time", async () => {
  const f = fixture();
  const visit = at(DAY);
  f.job("j-1", { scheduledAt: visit });
  const missing = await f.api.move("tess", "j-1", move("RESCHEDULED", 1));
  assert.equal(missing.status, 400);
  assert.equal(missing.body.code, "REASON_REQUIRED");
  assert.equal((await f.api.move("tess", "j-1", move("RESCHEDULED", 1, { reason: "   " }))).body.code, "REASON_REQUIRED");
  assert.equal(f.db.commits.length, 0);
  const body = move("RESCHEDULED", 1, { reason: "Van broke down" });
  const declined = await f.api.move("tess", "j-1", body);
  assert.equal(declined.status, 200);
  assert.deepEqual(declined.body, { job: null });
  const stored = f.db.values("jobs").find((x) => x.path === "jobs/j-1").data;
  assert.equal(stored.status, "RESCHEDULED");
  assert.equal(stored.assignedTechnicianId, null);
  assert.equal(stored.assignedTechnicianName, null);
  assert.equal(stored.scheduledAt.toMillis(), visit.toMillis());
  assert.equal(stored.version, 2);
  const [entry] = f.mobileAudit();
  assert.equal(entry.data.action, "JOB_DECLINED");
  assert.equal(entry.data.metadata.reason, "Van broke down");
  assert.equal(entry.data.metadata.actorName, "Tess Fernandes");
  assert.equal((await f.api.detail("tess", "j-1")).status, 404, "no longer the technician's job");
  assert.deepEqual((await f.api.list("tess")).body.jobs.open, []);
  assert.deepEqual((await f.api.move("tess", "j-1", body)).body, { job: null }, "a retry answers the same");
  assert.equal(f.mobileAudit().length, 1);

  // The dispatcher hands it to someone else with the existing dispatch panel.
  const web = f.load("src/features/jobs/repositories/job.repository.ts");
  const office = { uid: "dina", email: "dina@example.com", displayName: "Dina", organizationId: "org-a", organizationName: "Greenleaf Services", membershipId: "org-a_dina", role: "DISPATCHER" };
  const redispatched = await web.dispatchJob(office, "j-1", { technicianId: "t-arjun", scheduledAt: visit.toDate().toISOString(), version: 2 });
  assert.equal(redispatched.status, "ASSIGNED");
  assert.equal(redispatched.assignedTechnicianName, "Arjun Rao");

  f.job("j-2", { status: "ACCEPTED" });
  const cantMakeIt = await f.api.move("tess", "j-2", move("RESCHEDULED", 1, { reason: "Running late on another site" }));
  assert.deepEqual(cantMakeIt.body, { job: null });
});

test("putting a job on hold needs a reason, which the history shows", async () => {
  const f = fixture();
  f.job("j-1", { status: "IN_PROGRESS" });
  assert.equal((await f.api.move("tess", "j-1", move("ON_HOLD", 1))).body.code, "REASON_REQUIRED");
  const held = await f.api.move("tess", "j-1", move("ON_HOLD", 1, { reason: "Waiting for parts" }));
  assert.equal(held.status, 200);
  assert.equal(held.body.job.status, "ON_HOLD");
  assert.deepEqual(held.body.job.moves, [{ to: "IN_PROGRESS", input: "none" }]);
  assert.equal(held.body.job.history[0].note, "Waiting for parts");
  assert.equal(f.mobileAudit()[0].data.metadata.note, "Waiting for parts");
  assert.equal((await f.api.move("tess", "j-1", move("IN_PROGRESS", 2))).body.job.status, "IN_PROGRESS");
});

test("request bodies are checked strictly and bad ones change nothing", async () => {
  const f = fixture();
  f.job("j-1");
  const bad = [
    { ...move("ACCEPTED", 1), status: "PAID" },
    { ...move("ACCEPTED", 1), requestId: "not-a-uuid" },
    move("ACCEPTED", 0),
    move("NOT_A_STATUS", 1),
    move("ACCEPTED", 1, { note: "x".repeat(501) }),
    move("ACCEPTED", 1, { note: "bell\u0007" }),
  ];
  for (const body of bad) assert.equal((await f.api.move("tess", "j-1", body)).status, 400, JSON.stringify(body).slice(0, 60));
  assert.equal((await f.api.move("tess", "j-1", "{not json")).status, 400);
  assert.equal((await f.api.move("tess", "j-1", move("ACCEPTED", 1), "text/plain")).status, 415);
  assert.equal((await f.api.note("tess", "j-1", { body: "", requestId: randomUUID() })).status, 400);
  assert.equal((await f.api.note("tess", "j-1", { body: "Hello there", requestId: randomUUID(), authorName: "Spoof" })).status, 400);
  assert.equal(f.db.commits.length, 0);
});

test("notes from the app join the job's notes, are safe to retry, and the office sees them", async () => {
  const f = fixture();
  f.job("j-1", { status: "ARRIVED" });
  const body = { body: "Customer asked us to use the side gate.", requestId: randomUUID() };
  const first = await f.api.note("tess", "j-1", body);
  assert.equal(first.status, 201);
  assert.equal(first.body.note.authorName, "Tess Fernandes");
  assert.equal(first.body.note.mine, true);
  const again = await f.api.note("tess", "j-1", body);
  assert.equal(again.status, 201);
  assert.equal(again.body.note.id, first.body.note.id);
  const notes = f.db.values("jobNotes");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].data.authorUserId, "tess");
  assert.equal(notes[0].data.organizationId, "org-a");
  assert.equal(notes[0].data.source, "MOBILE");
  const web = f.load("src/features/jobs/repositories/job.repository.ts");
  const office = { uid: "dina", email: "dina@example.com", displayName: "Dina", organizationId: "org-a", organizationName: "Greenleaf Services", membershipId: "org-a_dina", role: "DISPATCHER" };
  const seen = await web.listJobNotes(office, "j-1");
  assert.equal(seen[0].body, "Customer asked us to use the side gate.");
  assert.equal(seen[0].authorName, "Tess Fernandes");
  f.job("j-cancelled", { status: "CANCELLED" });
  const refused = await f.api.note("tess", "j-cancelled", { body: "Too late now", requestId: randomUUID() });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "STATE");
});

test("the office's Activity names the technician and the app", () => {
  const f = fixture();
  const { describeJobActivity } = f.load("src/features/jobs/utils/job-activity.ts");
  const entry = (action, metadata) => ({ id: "a", action, actorUserId: "tess", metadata, createdAt: "2026-10-05T04:00:00.000Z" });
  const app = { source: "MOBILE", actorName: "Tess Fernandes", technicianId: "t-tess" };
  assert.equal(describeJobActivity(entry("JOB_STATUS_CHANGED", { from: "ACCEPTED", to: "EN_ROUTE", ...app })), "Status changed from Accepted to En route by Tess Fernandes in the technician app.");
  assert.equal(describeJobActivity(entry("JOB_STATUS_CHANGED", { from: "IN_PROGRESS", to: "ON_HOLD", note: "Waiting for parts", ...app })), "Status changed from In progress to On hold by Tess Fernandes in the technician app — Waiting for parts.");
  assert.equal(describeJobActivity(entry("JOB_DECLINED", { from: "ASSIGNED", to: "RESCHEDULED", reason: "Van broke down", ...app })), "Declined by Tess Fernandes in the technician app — Van broke down. The job is back with the office as Rescheduled.");
  assert.equal(describeJobActivity(entry("JOB_STATUS_CHANGED", { from: "ASSIGNED", to: "CANCELLED" })), "Status changed from Assigned to Cancelled.", "office entries read as before");
});

test("unexpected failures are logged and answered without details", async () => {
  const f = fixture();
  f.job("j-1");
  f.db.failNextCommit = true;
  const result = await f.api.move("tess", "j-1", move("ACCEPTED", 1));
  assert.equal(result.status, 500);
  assert.equal(result.body.message, "We couldn’t update this job. Please try again.");
  assert.ok(!JSON.stringify(result.body).includes("secret"));
  assert.ok(f.logged.length > 0);
  assert.equal(f.db.values("jobs").find((x) => x.path === "jobs/j-1").data.status, "ASSIGNED");
});

let failed = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`ok - ${name}`); }
  catch (error) { failed++; console.error(`not ok - ${name}`); console.error(error); }
}
if (failed) { console.error(`Mobile job checks failed: ${failed}/${tests.length}.`); process.exit(1); }
console.log(`Mobile job checks passed: ${tests.length}/${tests.length}.`);
