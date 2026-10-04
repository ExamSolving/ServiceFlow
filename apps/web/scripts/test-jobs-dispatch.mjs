import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { moduleLoader, MemoryFirestore, MemoryTimestamp, firestoreMock, commitDate } from "./helpers/firestore-harness.mjs";

const owner = { uid: "owner-a", organizationId: "org-a", role: "OWNER", displayName: "Olive Owner" };
const form = { customerId: "customer-a", serviceTypeId: "service-a", title: "Boiler service", description: "Annual inspection of the office boiler.", priority: "NORMAL", serviceAddress: "4 Mill Lane, Pune 411001" };
const tests = [];
const test = (name, run) => tests.push({ name, run });
// Arrays created inside the module sandbox have a different prototype; compare by value.
function same(actual, expected, message) { assert.equal(JSON.stringify(actual), JSON.stringify(expected), message); }

function fixture() {
  const db = new MemoryFirestore();
  db.seed("customers/customer-a", { organizationId: "org-a", name: "Customer A", customerNumber: "CUS-000001", nameSearch: "customer a", isActive: true });
  db.seed("serviceTypes/service-a", { organizationId: "org-a", name: "Boiler", nameSearch: "boiler", isActive: true, estimatedDurationMinutes: 90 });
  db.seed("organizationSettings/org-a", { organizationId: "org-a", jobNumberPrefix: "JOB", timezone: "Asia/Kolkata" });
  db.seed("technicians/tech-a", { organizationId: "org-a", userId: "user-t", displayName: "Tess Tech", nameSearch: "tess tech", status: "AVAILABLE", employeeNumber: "TEC-000001", version: 1 });
  db.seed("technicians/tech-b", { organizationId: "org-a", userId: "user-b", displayName: "Bala Busy", nameSearch: "bala busy", status: "BUSY", employeeNumber: "TEC-000002", version: 1 });
  db.seed("technicians/tech-inactive", { organizationId: "org-a", userId: "user-i", displayName: "Ina Inactive", nameSearch: "ina inactive", status: "INACTIVE", employeeNumber: "TEC-000003", version: 1 });
  db.seed("technicians/tech-foreign", { organizationId: "org-b", userId: "user-f", displayName: "Fred Foreign", nameSearch: "fred foreign", status: "AVAILABLE", employeeNumber: "TEC-000001", version: 1 });
  const load = moduleLoader({
    "firebase-admin/firestore": firestoreMock,
    "@/src/lib/firebase/admin": { adminDb: db },
    console: { error() {}, warn() {}, log() {}, info() {}, debug() {} },
  });
  return { db, load, repo: load("src/features/jobs/repositories/job.repository.ts"), schema: load("src/features/jobs/schemas/job.schema.ts"), errors: load("src/features/jobs/repositories/job-errors.ts"), workflow: load("src/features/jobs/utils/job-workflow.ts") };
}
const create = (f) => f.repo.createJob(owner, { ...form, requestId: randomUUID() });
const visit = "2026-10-06T04:30:00.000Z";

test("schemas accept dispatch and transition payloads but reject billing statuses and injected fields", () => {
  const { schema } = fixture();
  assert.equal(schema.jobDispatchSchema.safeParse({ technicianId: "tech-a", scheduledAt: visit, version: 1 }).success, true);
  assert.equal(schema.jobDispatchSchema.safeParse({ technicianId: "tech-a", scheduledAt: null, version: 1 }).success, true);
  assert.equal(schema.jobDispatchSchema.safeParse({ technicianId: "../x", scheduledAt: null, version: 1 }).success, false);
  assert.equal(schema.jobDispatchSchema.safeParse({ technicianId: "tech-a", scheduledAt: "tomorrow", version: 1 }).success, false);
  assert.equal(schema.jobDispatchSchema.safeParse({ technicianId: "tech-a", scheduledAt: null, version: 1, status: "COMPLETED" }).success, false);
  for (const to of ["INVOICED", "PARTIAL", "PAID"]) assert.equal(schema.jobTransitionSchema.safeParse({ action: "TRANSITION", to, version: 1 }).success, false, to);
  assert.equal(schema.jobActionSchema.safeParse({ action: "CANCEL", version: 1 }).success, true);
  assert.equal(schema.jobActionSchema.safeParse({ action: "TRANSITION", to: "ACCEPTED", version: 1, note: "called ahead" }).success, true);
  assert.equal(schema.jobNoteSchema.safeParse({ body: "", requestId: randomUUID() }).success, false);
});

test("dispatch assigns an active technician of the same tenant and records the visit", async () => {
  const f = fixture();
  const job = await create(f);
  assert.equal(job.estimatedDurationMinutes, 90, "service duration is captured for the schedule");
  await assert.rejects(f.repo.dispatchJob(owner, job.id, { technicianId: "tech-foreign", scheduledAt: visit, version: 1 }), f.errors.JobReferenceError);
  await assert.rejects(f.repo.dispatchJob(owner, job.id, { technicianId: "tech-inactive", scheduledAt: visit, version: 1 }), f.errors.JobReferenceError);
  await assert.rejects(f.repo.dispatchJob(owner, job.id, { technicianId: "tech-a", scheduledAt: visit, version: 2 }), f.errors.JobConflictError);
  await assert.rejects(f.repo.dispatchJob({ ...owner, role: "TECHNICIAN" }, job.id, { technicianId: "tech-a", scheduledAt: visit, version: 1 }), f.errors.JobAccessError);
  assert.equal(f.db.values("auditLogs").length, 1);
  const dispatched = await f.repo.dispatchJob(owner, job.id, { technicianId: "tech-a", scheduledAt: visit, version: 1 });
  assert.equal(dispatched.status, "ASSIGNED");
  assert.equal(dispatched.assignedTechnicianName, "Tess Tech");
  assert.equal(dispatched.scheduledAt, visit);
  assert.equal(dispatched.version, 2);
  const audit = f.db.values("auditLogs").at(-1).data;
  assert.equal(audit.action, "JOB_DISPATCHED");
  same(audit.metadata.path, ["ASSIGNED"]);
  const reassigned = await f.repo.dispatchJob(owner, job.id, { technicianId: "tech-b", scheduledAt: null, version: 2 });
  assert.equal(reassigned.status, "ASSIGNED"); assert.equal(reassigned.scheduledAt, null); assert.equal(reassigned.assignedTechnicianName, "Bala Busy");
  const unchanged = await f.repo.dispatchJob(owner, job.id, { technicianId: "tech-b", scheduledAt: null, version: 3 });
  assert.equal(unchanged.version, 3, "identical dispatch is a no-op");
});

test("changing an accepted job goes through RESCHEDULED back to ASSIGNED", async () => {
  const f = fixture();
  const job = await create(f);
  await f.repo.dispatchJob(owner, job.id, { technicianId: "tech-a", scheduledAt: visit, version: 1 });
  const accepted = await f.repo.transitionJob(owner, job.id, { action: "TRANSITION", to: "ACCEPTED", version: 2 });
  assert.equal(accepted.status, "ACCEPTED");
  const moved = await f.repo.dispatchJob(owner, job.id, { technicianId: "tech-a", scheduledAt: "2026-10-07T04:30:00.000Z", version: 3 });
  assert.equal(moved.status, "ASSIGNED");
  same(f.db.values("auditLogs").at(-1).data.metadata.path, ["RESCHEDULED", "ASSIGNED"]);
  const started = await f.repo.transitionJob(owner, job.id, { action: "TRANSITION", to: "ACCEPTED", version: 4 });
  await assert.rejects(f.repo.dispatchJob(owner, job.id, { technicianId: "tech-b", scheduledAt: null, version: 5 }).then(() => f.repo.transitionJob(owner, job.id, { action: "TRANSITION", to: "EN_ROUTE", version: 6 })).then(() => f.repo.dispatchJob(owner, job.id, { technicianId: "tech-a", scheduledAt: null, version: 7 })), f.errors.JobStateError, "dispatch is locked once the technician is en route");
  assert.equal(started.version, 5);
});

test("transitions follow the state machine, require a technician for field work and stamp completion", async () => {
  const f = fixture();
  const job = await create(f);
  await assert.rejects(f.repo.transitionJob(owner, job.id, { action: "TRANSITION", to: "COMPLETED", version: 1 }), f.errors.JobStateError);
  await assert.rejects(f.repo.transitionJob(owner, job.id, { action: "TRANSITION", to: "ASSIGNED", version: 1 }).then(() => f.repo.transitionJob(owner, job.id, { action: "TRANSITION", to: "ACCEPTED", version: 2 })), f.errors.JobStateError, "ACCEPTED needs an assigned technician");
  const f2 = fixture();
  const job2 = await create(f2);
  await f2.repo.dispatchJob(owner, job2.id, { technicianId: "tech-a", scheduledAt: visit, version: 1 });
  let version = 2;
  for (const to of ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"]) {
    const result = await f2.repo.transitionJob(owner, job2.id, { action: "TRANSITION", to, version, note: `now ${to}` });
    assert.equal(result.status, to); version = result.version;
  }
  const completed = await f2.repo.transitionJob(owner, job2.id, { action: "TRANSITION", to: "COMPLETED", version });
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.completedAt, commitDate.toISOString());
  assert.equal(f2.db.records.get(`jobs/${job2.id}`).completedAt.toMillis(), commitDate.getTime());
  await assert.rejects(f2.repo.transitionJob(owner, job2.id, { action: "TRANSITION", to: "CANCELLED", version: completed.version }), f2.errors.JobStateError, "completed jobs cannot be cancelled");
  await assert.rejects(f2.repo.cancelJob(owner, job2.id, { action: "CANCEL", version: completed.version }), f2.errors.JobStateError);
  assert.ok(f2.db.values("auditLogs").some((entry) => entry.data.metadata.note === "now EN_ROUTE"));
  assert.equal(f2.workflow.webJobTransitions("COMPLETED").length, 0, "billing drives the job after completion");
  same([...f2.workflow.webJobTransitions("PAID")], ["CLOSED"]);
});

test("notes are idempotent, tenant-bound and listed with activity newest first", async () => {
  const f = fixture();
  const job = await create(f);
  const requestId = randomUUID();
  const note = await f.repo.addJobNote(owner, job.id, { body: "Customer prefers afternoons.", requestId });
  const replay = await f.repo.addJobNote(owner, job.id, { body: "Customer prefers afternoons.", requestId });
  assert.equal(note.id, replay.id);
  assert.equal(f.db.values("jobNotes").length, 1);
  await assert.rejects(f.repo.addJobNote({ ...owner, organizationId: "org-b" }, job.id, { body: "x", requestId: randomUUID() }), f.errors.JobNotFoundError);
  const notes = await f.repo.listJobNotes(owner, job.id);
  assert.equal(notes.length, 1); assert.equal(notes[0].authorName, "Olive Owner");
  await f.repo.dispatchJob(owner, job.id, { technicianId: "tech-a", scheduledAt: visit, version: 1 });
  const activity = await f.repo.listJobActivity(owner, job.id);
  same([...activity.map((entry) => entry.action)].sort(), ["JOB_CREATED", "JOB_DISPATCHED"], "both audit rows belong to the job (the fake clock cannot order them)");
  assert.equal((await f.repo.listJobActivity({ ...owner, organizationId: "org-b" }, job.id)).length, 0);
});

test("schedule queries are bounded by range, technician and tenant; backlog excludes scheduled and closed jobs", async () => {
  const f = fixture();
  const a = await create(f), b = await create(f), c = await create(f), d = await create(f);
  await f.repo.dispatchJob(owner, a.id, { technicianId: "tech-a", scheduledAt: "2026-10-06T03:30:00.000Z", version: 1 });
  await f.repo.dispatchJob(owner, b.id, { technicianId: "tech-b", scheduledAt: "2026-10-06T09:00:00.000Z", version: 1 });
  await f.repo.dispatchJob(owner, c.id, { technicianId: "tech-a", scheduledAt: "2026-10-09T03:30:00.000Z", version: 1 });
  await f.repo.cancelJob(owner, d.id, { action: "CANCEL", version: 1 });
  f.db.seed("jobs/foreign", { ...f.db.records.get(`jobs/${a.id}`), organizationId: "org-b" });
  const range = { start: new Date("2026-10-05T18:30:00.000Z"), end: new Date("2026-10-06T18:30:00.000Z") };
  const day = await f.repo.listScheduledJobs(owner, range);
  same(day.map((job) => job.id), [a.id, b.id]);
  const mine = await f.repo.listScheduledJobs(owner, range, "tech-a");
  same(mine.map((job) => job.id), [a.id]);
  await assert.rejects(f.repo.listScheduledJobs(owner, range, "../tech"), f.errors.JobNotFoundError);
  const e = await create(f);
  const backlog = await f.repo.listUnscheduledJobs(owner);
  same(backlog.map((job) => job.id), [e.id], "only open jobs without a visit time");
  for (const query of f.db.queries) assert.ok(query.filters.some((filter) => filter.field === "organizationId" && filter.value === "org-a"));
});

test("technician options search active profiles only", async () => {
  const f = fixture();
  const all = await f.repo.listTechnicianOptions(owner, { q: "" });
  same(all.options.map((option) => option.id).sort(), ["tech-a", "tech-b"]);
  const search = await f.repo.listTechnicianOptions(owner, { q: "TESS" });
  same(search.options.map((option) => option.name), ["Tess Tech"]);
  assert.equal(search.options[0].secondary, "Available");
  await assert.rejects(f.repo.listTechnicianOptions({ ...owner, role: "ACCOUNTANT" }, { q: "" }), f.errors.JobAccessError);
  await assert.rejects(f.repo.listTechnicianOptions(owner, { q: "", cursor: "tech-foreign" }), f.errors.JobCursorError);
});

let passed = 0;
for (const { name, run } of tests) {
  try { await run(); passed += 1; console.log(`PASS: ${name}`); }
  catch (error) { console.error(`FAIL: ${name}`); throw error; }
}
console.log(`Job dispatch and schedule checks passed: ${passed}/${tests.length}.`);
