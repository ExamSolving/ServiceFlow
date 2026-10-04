import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { moduleLoader, MemoryFirestore, MemoryTimestamp, firestoreMock, commitDate } from "./helpers/firestore-harness.mjs";

const owner = { uid: "owner-a", organizationId: "org-a", role: "OWNER", displayName: "Olive Owner" };
const admin = { uid: "admin-a", organizationId: "org-a", role: "ADMIN", displayName: "Adam Admin" };
const tests = [];
const test = (name, run) => tests.push({ name, run });

function fixture() {
  const db = new MemoryFirestore();
  db.seed("organizations/org-a", { name: "Acme Field Services", status: "ACTIVE", ownerUserId: owner.uid });
  db.seed("organizations/org-b", { name: "Other Co", status: "ACTIVE", ownerUserId: "owner-b" });
  db.seed("memberships/org-a_owner-a", { userId: owner.uid, organizationId: "org-a", role: "OWNER", status: "ACTIVE", createdAt: MemoryTimestamp.now(), updatedAt: MemoryTimestamp.now() });
  db.seed("users/owner-a", { email: "olive@acme.example", displayName: "Olive Owner", isActive: true, defaultOrganizationId: "org-a" });
  db.seed("memberships/org-a_admin-a", { userId: admin.uid, organizationId: "org-a", role: "ADMIN", status: "ACTIVE", displayName: "Adam Admin", email: "adam@acme.example", version: 1, createdAt: MemoryTimestamp.now(), updatedAt: MemoryTimestamp.now() });
  db.seed("memberships/org-a_tech-a", { userId: "tech-a", organizationId: "org-a", role: "TECHNICIAN", status: "ACTIVE", displayName: "Tess Tech", email: "tess@acme.example", version: 3, createdAt: MemoryTimestamp.now(), updatedAt: MemoryTimestamp.now() });
  db.seed("memberships/org-b_owner-b", { userId: "owner-b", organizationId: "org-b", role: "OWNER", status: "ACTIVE", displayName: "Bob", email: "bob@other.example", version: 1, createdAt: MemoryTimestamp.now(), updatedAt: MemoryTimestamp.now() });
  const load = moduleLoader({
    "firebase-admin/firestore": firestoreMock,
    "@/src/lib/firebase/admin": { adminDb: db },
    console: { error() {}, warn() {}, log() {}, info() {}, debug() {} },
  });
  return { db, load, repo: load("src/features/members/repositories/member.repository.ts"), schema: load("src/features/members/schemas/member.schema.ts"), errors: load("src/features/members/repositories/member-errors.ts") };
}
const invite = (f, session = owner, changes = {}) => f.repo.createInvitation(session, { email: "New.Person@Acme.example", role: "DISPATCHER", requestId: randomUUID(), ...changes });
const tokenFrom = (invitation) => invitation.acceptPath.replace("/invite/", "");

test("schemas normalise emails, restrict roles and reject injected fields", () => {
  const { schema } = fixture();
  const parsed = schema.invitationCreateSchema.parse({ email: "  New.Person@Acme.example ", role: "MANAGER", requestId: randomUUID() });
  assert.equal(parsed.email, "new.person@acme.example");
  for (const input of [{ role: "OWNER" }, { role: "CUSTOMER" }, { email: "not-an-email" }, { organizationId: "org-b" }, { status: "ACCEPTED" }, { requestId: "x" }]) {
    assert.equal(schema.invitationCreateSchema.safeParse({ email: "a@b.co", role: "ADMIN", requestId: randomUUID(), ...input }).success, false, JSON.stringify(input));
  }
  assert.equal(schema.memberRoleUpdateSchema.safeParse({ role: "OWNER", version: 1 }).success, false);
  assert.equal(schema.memberStatusSchema.safeParse({ action: "DELETE", version: 1 }).success, false);
  for (const token of ["short", "has space", "../x".repeat(10), "a".repeat(129)]) assert.equal(schema.invitationTokenSchema.safeParse(token).success, false, token);
});

test("only owners and admins reach the team repository; nothing is read first", async () => {
  const f = fixture();
  for (const session of [{ ...owner, role: "MANAGER" }, { ...owner, role: "TECHNICIAN" }, { ...owner, organizationId: "../org" }, { ...owner, uid: "" }]) {
    await assert.rejects(f.repo.listTeam(session), f.errors.MemberAccessError);
    await assert.rejects(invite(f, session), f.errors.MemberAccessError);
    await assert.rejects(f.repo.updateMemberRole(session, "org-a_tech-a", { role: "MANAGER", version: 3 }), f.errors.MemberAccessError);
  }
  assert.equal(f.db.reads.length, 0); assert.equal(f.db.queries.length, 0);
});

test("team listing is tenant-scoped, owners first, and backfills legacy profiles", async () => {
  const f = fixture();
  const team = await f.repo.listTeam(admin);
  assert.deepEqual(team.members.map((member) => member.userId), ["owner-a", "admin-a", "tech-a"]);
  assert.equal(team.members[0].email, "olive@acme.example", "legacy owner membership falls back to the user profile");
  assert.equal(team.members[0].version, 1);
  assert.equal(team.members.find((member) => member.userId === admin.uid).isSelf, true);
  assert.ok(team.members.every((member) => !("organizationId" in member)));
  assert.ok(!team.members.some((member) => member.userId === "owner-b"));
});

test("invitations mint a one-time link, replay safely and refuse duplicates", async () => {
  const f = fixture();
  const requestId = randomUUID();
  const created = await invite(f, owner, { requestId });
  assert.equal(created.email, "new.person@acme.example");
  assert.match(created.acceptPath, /^\/invite\/[A-Za-z0-9_-]{32,}$/);
  const stored = f.db.values("invitations")[0].data;
  assert.equal(stored.status, "PENDING");
  assert.ok(!JSON.stringify(stored).includes(tokenFrom(created)), "the clear-text token is never stored");
  assert.equal(stored.expiresAt.toMillis() - commitDate.getTime(), 7 * 24 * 60 * 60 * 1000);
  const replay = await invite(f, owner, { requestId });
  assert.equal(replay.id, created.id);
  assert.equal(replay.acceptPath, null);
  assert.equal(f.db.values("invitations").length, 1);
  assert.equal(f.db.values("auditLogs").length, 1);
  await assert.rejects(invite(f, owner, { requestId, role: "ADMIN" }), f.errors.MemberConflictError);
  await assert.rejects(invite(f), (error) => error instanceof f.errors.MemberRuleError && error.code === "INVITATION_PENDING");
  await assert.rejects(invite(f, owner, { email: "TESS@acme.example" }), (error) => error instanceof f.errors.MemberRuleError && error.code === "ALREADY_MEMBER");
  f.db.seed("memberships/org-a_sus-a", { userId: "sus-a", organizationId: "org-a", role: "MANAGER", status: "SUSPENDED", email: "sus@acme.example", displayName: "Sue", version: 1, createdAt: MemoryTimestamp.now(), updatedAt: MemoryTimestamp.now() });
  await assert.rejects(invite(f, owner, { email: "sus@acme.example" }), (error) => error instanceof f.errors.MemberRuleError && error.code === "MEMBER_SUSPENDED");
  assert.ok(f.db.values("auditLogs").every((entry) => !JSON.stringify(entry.data.metadata).includes("acme.example")), "audit metadata never carries invitee emails");
});

test("accepting creates the profile and membership exactly once with matching email", async () => {
  const f = fixture();
  const created = await invite(f);
  const token = tokenFrom(created);
  await assert.rejects(f.repo.acceptInvitation({ uid: "new-1", email: "someone.else@acme.example" }, token), (error) => error instanceof f.errors.InvitationStateError && error.code === "EMAIL_MISMATCH");
  await assert.rejects(f.repo.acceptInvitation({ uid: "new-1", email: "new.person@acme.example" }, "A".repeat(43)), f.errors.InvitationNotFoundError);
  assert.equal(f.db.values("memberships").length, 4);
  const result = await f.repo.acceptInvitation({ uid: "new-1", email: "New.Person@acme.example", displayName: "Nia New" }, token);
  assert.equal(result.organizationId, "org-a");
  assert.equal(result.organizationName, "Acme Field Services");
  const membership = f.db.records.get("memberships/org-a_new-1");
  assert.equal(membership.role, "DISPATCHER");
  assert.equal(membership.status, "ACTIVE");
  assert.equal(membership.email, "new.person@acme.example");
  const user = f.db.records.get("users/new-1");
  assert.equal(user.defaultOrganizationId, "org-a");
  assert.equal(user.isActive, true);
  assert.equal(user.displayName, "Nia New");
  assert.equal(f.db.values("invitations")[0].data.status, "ACCEPTED");
  await assert.rejects(f.repo.acceptInvitation({ uid: "new-2", email: "new.person@acme.example" }, token), (error) => error instanceof f.errors.InvitationStateError && error.code === "ACCEPTED");
  const preview = await f.repo.previewInvitation(token);
  assert.equal(preview, null, "used invitations have no public preview");
});

test("expired, revoked and regenerated links behave predictably", async () => {
  const f = fixture();
  const created = await invite(f);
  const token = tokenFrom(created);
  assert.equal((await f.repo.previewInvitation(token)).organizationName, "Acme Field Services");
  const path = f.db.values("invitations")[0].path;
  f.db.seed(path, { ...f.db.records.get(path), expiresAt: MemoryTimestamp.fromDate(new Date(commitDate.getTime() - 1000)) });
  assert.equal(await f.repo.previewInvitation(token), null);
  await assert.rejects(f.repo.acceptInvitation({ uid: "new-1", email: "new.person@acme.example" }, token), (error) => error instanceof f.errors.InvitationStateError && error.code === "EXPIRED");
  const team = await f.repo.listTeam(owner);
  assert.equal(team.invitations[0].status, "EXPIRED");
  const renewed = await f.repo.regenerateInvitation(owner, created.id, { version: 1 });
  assert.notEqual(tokenFrom(renewed), token);
  assert.equal(await f.repo.previewInvitation(token), null, "old link stops working");
  assert.equal((await f.repo.previewInvitation(tokenFrom(renewed))).role, "DISPATCHER");
  await assert.rejects(f.repo.regenerateInvitation(owner, created.id, { version: 1 }), f.errors.MemberConflictError);
  const revoked = await f.repo.revokeInvitation(owner, created.id, { version: 2 });
  assert.equal(revoked.status, "REVOKED");
  await assert.rejects(f.repo.acceptInvitation({ uid: "new-1", email: "new.person@acme.example" }, tokenFrom(renewed)), (error) => error instanceof f.errors.InvitationStateError && error.code === "REVOKED");
  await assert.rejects(f.repo.revokeInvitation({ ...owner, organizationId: "org-b" }, created.id, { version: 3 }), f.errors.InvitationNotFoundError);
});

test("role and access changes protect the owner and the actor, and are versioned", async () => {
  const f = fixture();
  await assert.rejects(f.repo.updateMemberRole(admin, "org-a_owner-a", { role: "ADMIN", version: 1 }), (error) => error instanceof f.errors.MemberRuleError && error.code === "OWNER_PROTECTED");
  await assert.rejects(f.repo.setMemberStatus(admin, "org-a_admin-a", { action: "SUSPEND", version: 1 }), (error) => error instanceof f.errors.MemberRuleError && error.code === "SELF_CHANGE");
  await assert.rejects(f.repo.updateMemberRole(owner, "org-a_tech-a", { role: "MANAGER", version: 2 }), f.errors.MemberConflictError);
  await assert.rejects(f.repo.updateMemberRole(owner, "org-b_owner-b", { role: "MANAGER", version: 1 }), f.errors.MemberNotFoundError);
  const changed = await f.repo.updateMemberRole(owner, "org-a_tech-a", { role: "MANAGER", version: 3 });
  assert.equal(changed.role, "MANAGER"); assert.equal(changed.version, 4);
  assert.equal(f.db.values("auditLogs").at(-1).data.action, "MEMBER_ROLE_CHANGED");
  const suspended = await f.repo.setMemberStatus(owner, "org-a_tech-a", { action: "SUSPEND", version: 4 });
  assert.equal(suspended.status, "SUSPENDED");
  const again = await f.repo.setMemberStatus(owner, "org-a_tech-a", { action: "SUSPEND", version: 5 });
  assert.equal(again.version, 5, "suspending twice is a no-op without a new audit row");
  await assert.rejects(f.repo.setMemberStatus(owner, "org-a_tech-a", { action: "REACTIVATE", version: 4 }), f.errors.MemberConflictError, "stale version");
  const restored = await f.repo.setMemberStatus(owner, "org-a_tech-a", { action: "REACTIVATE", version: 5 });
  assert.equal(restored.status, "ACTIVE"); assert.equal(restored.version, 6);
  assert.equal(f.db.records.get("memberships/org-b_owner-b").role, "OWNER");
});

let passed = 0;
for (const { name, run } of tests) {
  try { await run(); passed += 1; console.log(`PASS: ${name}`); }
  catch (error) { console.error(`FAIL: ${name}`); throw error; }
}
console.log(`Team membership checks passed: ${passed}/${tests.length}.`);
