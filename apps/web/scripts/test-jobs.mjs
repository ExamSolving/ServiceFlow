import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { moduleLoader, MemoryFirestore, MemoryTimestamp, firestoreMock } from "./helpers/firestore-harness.mjs";

const owner = { uid: "owner-a", organizationId: "org-a", role: "OWNER" };
const form = { customerId: "customer-a", serviceTypeId: "service-a", title: "Air conditioner repair", description: "Office unit is not cooling properly.", priority: "HIGH", serviceAddress: "12 Lake Road, Hyderabad 500001" };
const tests = [];
const test = (name, run) => tests.push({ name, run });
function fixture() {
  const db = new MemoryFirestore();
  for (const org of ["a", "b"]) {
    db.seed(`customers/customer-${org}`, { organizationId: `org-${org}`, name: `Customer ${org}`, customerNumber: "CUS-000001", nameSearch: `customer ${org}`, isActive: true });
    db.seed(`serviceTypes/service-${org}`, { organizationId: `org-${org}`, name: `Repair ${org}`, nameSearch: `repair ${org}`, isActive: true });
  }
  db.seed("organizationSettings/org-a", { organizationId: "org-a", jobNumberPrefix: "FIX" });
  const state = { session: owner, authError: null, revalidated: [] };
  const load = moduleLoader({
    "firebase-admin/firestore": firestoreMock,
    "@/src/lib/firebase/admin": { adminDb: db },
    "@/src/lib/auth/require-auth": { requireAuth: async () => { if (state.authError) throw state.authError; return state.session; } },
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "next/cache": { revalidatePath: path => state.revalidated.push(path) },
    console: { error() {}, warn() {}, log() {} },
  });
  return { db, load, state, repo: load("src/features/jobs/repositories/job.repository.ts"), schema: load("src/features/jobs/schemas/job.schema.ts"), errors: load("src/features/jobs/repositories/job-errors.ts") };
}
const create = (f, changes = {}) => f.repo.createJob(owner, { ...form, requestId: randomUUID(), ...changes });
function source(f, changes = {}) {
  const values = Object.fromEntries(Object.entries(form).filter(([key]) => key !== "serviceAddress"));
  f.db.seed("serviceRequests/source-a", { ...values, organizationId: "org-a", status: "REVIEWING", version: 1, titleSearch: "air conditioner repair", ...changes });
  return { serviceRequestId: "source-a", version: 1, serviceAddress: form.serviceAddress };
}
function noJobs(f) {
  for (const collection of ["jobs", "jobCounters", "auditLogs"]) assert.equal(f.db.values(collection).length, 0, collection);
}
test("strict schemas reject tenant, lifecycle, number, source, assignment and schedule injection", () => {
  const { schema } = fixture();
  for (const extra of [{ organizationId: "org-b" }, { status: "PAID" }, { jobNumber: "FIX-1" }, { serviceRequestId: "source-a" }, { assignedTechnicianId: "technician" }, { scheduledAt: new Date().toISOString() }, { createdBy: "spoof" }, { version: 1 }]) {
    assert.equal(schema.jobCreateSchema.safeParse({ ...form, requestId: randomUUID(), ...extra }).success, false);
  }
  assert.equal(schema.jobFormSchema.safeParse({ ...form, serviceAddress: "" }).success, false);
  assert.equal(schema.jobConvertSchema.safeParse({ serviceRequestId: "a", version: 1, serviceAddress: form.serviceAddress, title: "Override" }).success, false);
  assert.equal(schema.jobCancelSchema.safeParse({ action: "ASSIGN", version: 1 }).success, false);
});
test("only operations roles can access repositories; malformed sessions fail before I/O", async () => {
  const f = fixture();
  for (const session of [{ ...owner, role: "TECHNICIAN" }, { ...owner, role: "ACCOUNTANT" }, { ...owner, organizationId: "../org" }, { ...owner, uid: "" }]) {
    await assert.rejects(f.repo.createJob(session, { ...form, requestId: randomUUID() }), f.errors.JobAccessError);
    await assert.rejects(f.repo.listJobs(session, { q: "", status: "ALL", priority: "ALL" }), f.errors.JobAccessError);
  }
  assert.equal(f.db.reads.length, 0); assert.equal(f.db.queries.length, 0);
  const result = await f.repo.createJob({ ...owner, role: "DISPATCHER" }, { ...form, requestId: randomUUID() });
  assert.equal(result.status, "NEW");
});
test("numbers follow organization prefix and concurrent creates have distinct sequential numbers", async () => {
  const f = fixture();
  const jobs = await Promise.all([create(f), create(f), create(f)]);
  assert.deepEqual(jobs.map(j => j.jobNumber).sort(), ["FIX-000001", "FIX-000002", "FIX-000003"]);
  f.db.seed("organizationSettings/org-a", { organizationId: "org-a", jobNumberPrefix: "JOB" });
  assert.equal((await create(f)).jobNumber, "JOB-000004");
});
test("creation retry is idempotent and payload changes conflict without incrementing counters", async () => {
  const f = fixture(), requestId = randomUUID();
  const first = await create(f, { requestId });
  const retry = await create(f, { requestId });
  assert.equal(first.id, retry.id);
  assert.equal(f.db.values("jobCounters")[0].data.lastNumber, 1);
  assert.equal(f.db.values("auditLogs").length, 1);
  await assert.rejects(create(f, { requestId, title: "Different title" }), f.errors.JobConflictError);
  assert.ok(f.db.values("auditLogs").every(x => !JSON.stringify(x.data.metadata).includes(form.description)));
});
test("foreign and inactive references are rejected, including a deactivation during a transaction retry", async () => {
  const f = fixture();
  await assert.rejects(create(f, { customerId: "customer-b" }), f.errors.JobReferenceError);
  await assert.rejects(create(f, { serviceTypeId: "service-b" }), f.errors.JobReferenceError);
  f.db.beforeNextCommit = db => db.seed("serviceTypes/service-a", { ...db.records.get("serviceTypes/service-a"), isActive: false });
  await assert.rejects(create(f), f.errors.JobReferenceError);
  noJobs(f);
});
test("foreign job IDs and cursors do not expose or mutate tenant records", async () => {
  const f = fixture(), job = await create(f);
  const other = { ...owner, organizationId: "org-b" };
  await assert.rejects(f.repo.readJob(other, job.id), f.errors.JobNotFoundError);
  await assert.rejects(f.repo.updateJob(other, job.id, { ...form, version: 1 }), f.errors.JobNotFoundError);
  await assert.rejects(f.repo.cancelJob(other, job.id, { action: "CANCEL", version: 1 }), f.errors.JobNotFoundError);
  await assert.rejects(f.repo.listJobs(other, { q: "", status: "ALL", priority: "ALL", cursor: job.id }), f.errors.JobCursorError);
});
test("missing legacy counters and malformed or foreign numbering settings fail atomically", async () => {
  for (const [path, data] of [
    ["jobs/legacy", { organizationId: "org-a", jobNumber: "FIX-000001" }],
    ["jobCounters/org-a", { organizationId: "org-b", lastNumber: 0 }],
    ["jobCounters/org-a", { organizationId: "org-a", lastNumber: -1 }],
    ["organizationSettings/org-a", { organizationId: "org-b", jobNumberPrefix: "FIX" }],
  ]) {
    const f = fixture(); f.db.seed(path, data);
    await assert.rejects(create(f)); assert.equal(f.db.values("auditLogs").length, 0); assert.equal(f.db.commits.length, 0);
  }
});
test("conversion creates exactly one job and updates source, number and both audit events atomically", async () => {
  const f = fixture(), input = source(f);
  const [first, retry] = await Promise.all([f.repo.convertRequestToJob(owner, input), f.repo.convertRequestToJob({ ...owner, uid: "dispatcher" }, input)]);
  assert.equal(first.id, retry.id); assert.equal(first.serviceRequestId, "source-a");
  assert.equal(f.db.records.get("serviceRequests/source-a").status, "CONVERTED_TO_JOB");
  assert.equal(f.db.records.get("serviceRequests/source-a").convertedJobId, first.id);
  assert.equal(f.db.values("jobs").length, 1); assert.equal(f.db.values("auditLogs").length, 2);
  assert.equal(f.db.values("jobCounters")[0].data.lastNumber, 1);
  await assert.rejects(f.repo.convertRequestToJob(owner, { ...input, serviceAddress: "Different address" }), f.errors.JobConflictError);
});
test("conversion rejects foreign, cancelled, stale or duplicate-linked requests without writes", async () => {
  for (const changes of [{ organizationId: "org-b" }, { status: "CANCELLED" }, { version: 2 }, { convertedJobId: "other" }]) {
    const f = fixture(), input = source(f, changes);
    await assert.rejects(f.repo.convertRequestToJob(owner, input)); noJobs(f);
  }
  const f = fixture(), input = source(f);
  f.db.seed("jobs/legacy", { organizationId: "org-a", serviceRequestId: "source-a" });
  await assert.rejects(f.repo.convertRequestToJob(owner, input), f.errors.JobConflictError);
});
test("failed conversion commits leave source, job number and audit untouched", async () => {
  const f = fixture(), input = source(f);
  f.db.failNextCommit = true;
  await assert.rejects(f.repo.convertRequestToJob(owner, input));
  noJobs(f); assert.equal(f.db.records.get("serviceRequests/source-a").status, "REVIEWING");
});
test("updates retain inactive references but verify their tenant; optimistic edits and no-ops behave correctly", async () => {
  const f = fixture(), job = await create(f);
  const unchanged = await f.repo.updateJob(owner, job.id, { ...form, version: 1 });
  assert.equal(unchanged.version, 1); assert.equal(f.db.values("auditLogs").length, 1);
  f.db.seed("customers/customer-a", { ...f.db.records.get("customers/customer-a"), isActive: false });
  const changed = await f.repo.updateJob(owner, job.id, { ...form, title: "Revised title", version: 1 });
  assert.equal(changed.version, 2);
  await assert.rejects(f.repo.updateJob(owner, job.id, { ...form, version: 1 }), f.errors.JobConflictError);
  f.db.seed("customers/customer-a", { ...f.db.records.get("customers/customer-a"), organizationId: "org-b" });
  await assert.rejects(f.repo.updateJob(owner, job.id, { ...form, version: 2 }), f.errors.JobReferenceError);
});
test("cancellation uses domain state machine and terminal jobs cannot be edited or converted again", async () => {
  const f = fixture(), input = source(f), job = await f.repo.convertRequestToJob(owner, input);
  const cancelled = await f.repo.cancelJob(owner, job.id, { action: "CANCEL", version: 1 });
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(f.db.records.get("serviceRequests/source-a").status, "CONVERTED_TO_JOB");
  await assert.rejects(f.repo.updateJob(owner, job.id, { ...form, version: 2 }), f.errors.JobStateError);
  await assert.rejects(f.repo.cancelJob(owner, job.id, { action: "CANCEL", version: 2 }), f.errors.JobStateError);
  assert.equal((await f.repo.convertRequestToJob(owner, input)).id, job.id);
  assert.equal(f.db.values("jobs").length, 1);
});
test("list pagination, title search and status/priority filters remain bounded and tenant scoped", async () => {
  const f = fixture();
  const first = await create(f), raw = f.db.records.get(`jobs/${first.id}`);
  for (let i = 0; i < 52; i++) f.db.seed(`jobs/list-${String(i).padStart(3, "0")}`, { ...raw, title: `Service ${i}`, titleSearch: `service ${i}`, priority: i % 2 ? "LOW" : "HIGH", createdAt: MemoryTimestamp.fromDate(new Date(1700000000000 + i * 1000)) });
  f.db.seed("jobs/foreign", { ...raw, organizationId: "org-b" });
  const filters = { q: "", status: "ALL", priority: "ALL" };
  const a = await f.repo.listJobs(owner, filters), b = await f.repo.listJobs(owner, { ...filters, cursor: a.nextCursor });
  assert.equal(a.jobs.length, 25); assert.equal(b.jobs.length, 25);
  assert.equal(new Set([...a.jobs, ...b.jobs].map(x => x.id)).size, 50);
  const filtered = await f.repo.listJobs(owner, { q: "Service 1", status: "NEW", priority: "LOW" });
  assert.ok(filtered.jobs.length > 0 && filtered.jobs.every(j => j.title.startsWith("Service 1") && j.priority === "LOW"));
  for (const query of f.db.queries) assert.ok(query.filters.some(p => p.field === "organizationId" && p.value === "org-a"));
});
test("HTTP routes enforce authentication, origin, JSON/body validation, safe errors and revalidation", async () => {
  const f = fixture(), route = f.load("src/app/api/jobs/route.ts");
  function request(body, origin = "http://localhost:3000") { const r = new Request("http://localhost:3000/api/jobs", { method: "POST", headers: { origin, host: "localhost:3000", "content-type": "application/json" }, body: JSON.stringify(body) }); r.nextUrl = new URL(r.url); return r; }
  const input = { ...form, requestId: randomUUID() };
  assert.equal((await route.POST(request(input, "https://foreign.example"))).status, 403);
  f.state.session = { ...owner, role: "TECHNICIAN" }; assert.equal((await route.POST(request(input))).status, 403);
  f.state.session = owner; assert.equal((await route.POST(request({ ...input, status: "PAID" }))).status, 400);
  assert.equal((await route.POST(request({ ...input, description: "x".repeat(40000) }))).status, 413);
  f.db.failNextCommit = true;
  const fail = await route.POST(request(input)); assert.equal(fail.status, 500); assert.ok(!(await fail.text()).includes("secret"));
  const ok = await route.POST(request(input)); assert.equal(ok.status, 201); assert.ok(f.state.revalidated.includes("/protected/dashboard"));
  f.state.authError = new Error("LOGIN_REDIRECT"); await assert.rejects(route.POST(request(input)), /LOGIN_REDIRECT/);
});
for (const { name, run } of tests) { await run(); console.log(`PASS: ${name}`); }
console.log(`Job checks passed: ${tests.length}/${tests.length}.`);
