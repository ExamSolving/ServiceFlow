import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Load the real feature modules. Replace only framework/session/database I/O,
// so schemas, access policy, query construction and transaction logic execute.
function moduleLoader(mocks = {}) {
  const cache = new Map();
  function load(relativePath) {
    let filename = resolve(root, relativePath);
    if (!existsSync(filename)) filename += ".ts";
    if (cache.has(filename)) return cache.get(filename).exports;
    const moduleRecord = { exports: {} };
    cache.set(filename, moduleRecord);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(source, {
      module: moduleRecord, exports: moduleRecord.exports, Buffer, URL, Request, Response, Headers, Date, Intl, TextDecoder,
      console: mocks.console ?? console,
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name === "server-only") return {};
        if (name.startsWith("@/")) return load(name.slice(2));
        if (name.startsWith(".")) return load(resolve(dirname(filename), name));
        if (name === "zod" || name.startsWith("node:")) return require(name);
        throw new Error(`Unexpected dependency: ${name} in ${filename}`);
      },
    }, { filename });
    return moduleRecord.exports;
  }
  return load;
}

const commitDate = new Date("2026-09-29T12:00:00.000Z");
const serverTimestamp = { __serverTimestamp: true };
class MemoryTimestamp {
  constructor(date) { this.date = new Date(date); }
  static now() { return new MemoryTimestamp(commitDate); }
  static fromDate(date) { return new MemoryTimestamp(date); }
  toDate() { return new Date(this.date); }
  toMillis() { return this.date.getTime(); }
}
function clone(value) {
  if (value instanceof MemoryTimestamp) return new MemoryTimestamp(value.toDate());
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}
function materialize(value) {
  if (value?.__serverTimestamp) return new MemoryTimestamp(commitDate);
  if (value instanceof MemoryTimestamp || value instanceof Date) return clone(value);
  if (Array.isArray(value)) return value.map(materialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item)]));
  return value;
}

// Atomic in-memory commits with retry-on-change model the repository's
// transactional guarantees, including two concurrently attempted creations.
// This is not a Firestore emulator and does not verify deployed indexes/rules.
class MemoryFirestore {
  records = new Map();
  queries = [];
  reads = [];
  commits = [];
  sequence = 0;
  revision = 0;
  failNextCommit = false;
  retryNextTransaction = false;
  beforeNextTransaction = null;
  beforeNextCommit = null;
  queryResultOverrides = new Map();
  seed(path, data) { this.records.set(path, clone(data)); this.revision += 1; }
  collection(name) { return new MemoryQuery(this, name); }
  doc(path) { return new MemoryDocument(this, path); }
  values(collection) {
    const depth = collection.split("/").length + 1;
    return [...this.records.entries()]
      .filter(([path]) => path.split("/").length === depth && path.startsWith(`${collection}/`))
      .map(([path, data]) => ({ path, data: clone(data) }));
  }
  snapshot(ref) {
    this.reads.push(ref.path);
    const stored = this.records.get(ref.path);
    return {
      id: ref.id, ref, exists: stored !== undefined,
      data: () => stored === undefined ? undefined : clone(stored),
      get: (field) => clone(stored?.[field]),
    };
  }
  async getAll(...refs) { return refs.map((ref) => this.snapshot(ref)); }
  async runTransaction(callback) {
    const before = this.beforeNextTransaction;
    this.beforeNextTransaction = null;
    if (before) await before(this);
    for (let attempt = 0; attempt < 10; attempt++) {
      const revision = this.revision;
      const writes = [];
      const transaction = {
        get: async (ref) => {
          assert.equal(writes.length, 0, "Firestore reads must precede writes");
          return ref instanceof MemoryQuery ? ref.get() : this.snapshot(ref);
        },
        getAll: async (...refs) => {
          assert.equal(writes.length, 0, "Firestore reads must precede writes");
          return refs.map((ref) => this.snapshot(ref));
        },
      };
      for (const type of ["create", "set", "update", "delete"]) {
        transaction[type] = (ref, data, options) => {
          writes.push({ type, path: ref.path, data, options });
          return transaction;
        };
      }
      const result = await callback(transaction);
      const commitHook = this.beforeNextCommit;
      this.beforeNextCommit = null;
      if (commitHook) await commitHook(this);
      if (this.retryNextTransaction) {
        this.retryNextTransaction = false;
        continue;
      }
      if (revision !== this.revision) continue;
      if (this.failNextCommit) {
        this.failNextCommit = false;
        throw new Error("Injected Firestore failure: secret database detail");
      }
      const next = new Map(this.records);
      for (const write of writes) {
        const current = next.get(write.path);
        if (write.type === "create" && current !== undefined) throw new Error("ALREADY_EXISTS");
        if (write.type === "update" && current === undefined) throw new Error("NOT_FOUND");
        if (write.type === "delete") next.delete(write.path);
        else next.set(write.path, write.type === "update" || write.options?.merge
          ? { ...current, ...materialize(write.data) }
          : materialize(write.data));
      }
      this.records = next;
      if (writes.length) this.revision += 1;
      this.commits.push(writes.map(({ type, path, data }) => ({ type, path, data: materialize(data) })));
      return result;
    }
    throw new Error("Test transaction exhausted retries");
  }
}
class MemoryDocument {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split("/").at(-1); }
  async get() { return this.db.snapshot(this); }
  collection(name) { return new MemoryQuery(this.db, `${this.path}/${name}`); }
}
function compare(a, b) {
  const left = a instanceof Date ? a.getTime() : a instanceof MemoryTimestamp ? a.toMillis() : a;
  const right = b instanceof Date ? b.getTime() : b instanceof MemoryTimestamp ? b.toMillis() : b;
  return left < right ? -1 : left > right ? 1 : 0;
}
class MemoryQuery {
  constructor(db, path, filters = [], order = [], maximum, cursor) {
    Object.assign(this, { db, path, filters, order, maximum, cursor });
  }
  next(changes) { return Object.assign(new MemoryQuery(this.db, this.path, this.filters, this.order, this.maximum, this.cursor), changes); }
  doc(id) { return new MemoryDocument(this.db, `${this.path}/${id ?? `auto-${++this.db.sequence}`}`); }
  where(field, operator, value) { return this.next({ filters: [...this.filters, { field, operator, value }] }); }
  orderBy(field, direction = "asc") { return this.next({ order: [...this.order, { field, direction }] }); }
  limit(maximum) { return this.next({ maximum }); }
  startAfter(...cursor) { return this.next({ cursor }); }
  async get() {
    this.db.queries.push({ path: this.path, filters: this.filters, order: this.order, maximum: this.maximum, cursor: this.cursor });
    if (this.db.queryResultOverrides.has(this.path)) {
      const docs = this.db.queryResultOverrides.get(this.path).map((path) => this.db.snapshot(this.db.doc(path)));
      return { docs, size: docs.length, empty: docs.length === 0 };
    }
    let rows = this.db.values(this.path);
    const fieldValue = (row, field) => field === "__name__" ? row.path.split("/").at(-1) : row.data[field];
    rows = rows.filter((row) => this.filters.every(({ field, operator, value }) => {
      const relation = compare(fieldValue(row, field), value);
      if (operator === "==") return relation === 0;
      if (operator === ">=") return relation >= 0;
      if (operator === "<=") return relation <= 0;
      if (operator === ">") return relation > 0;
      if (operator === "<") return relation < 0;
      if (operator === "in") return value.includes(fieldValue(row, field));
      throw new Error(`Unsupported query operator: ${operator}`);
    }));
    const order = this.order.length ? this.order : [{ field: "__name__", direction: "asc" }];
    const comparator = (left, right) => {
      for (const { field, direction } of order) {
        const relation = compare(fieldValue(left, field), fieldValue(right, field));
        if (relation) return relation * (direction === "desc" ? -1 : 1);
      }
      return compare(left.path, right.path);
    };
    rows.sort(comparator);
    if (this.cursor) {
      if (this.cursor[0]?.ref) {
        const start = { path: this.cursor[0].ref.path, data: this.cursor[0].data() };
        rows = rows.filter((row) => comparator(row, start) > 0);
      } else {
        rows = rows.filter((row) => {
          for (let index = 0; index < order.length; index++) {
            const { field, direction } = order[index];
            const relation = compare(fieldValue(row, field), this.cursor[index]) * (direction === "desc" ? -1 : 1);
            if (relation) return relation > 0;
          }
          return false;
        });
      }
    }
    if (this.maximum !== undefined) rows = rows.slice(0, this.maximum);
    const docs = rows.map((row) => this.db.snapshot(this.db.doc(row.path)));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

const firestoreMock = {
  FieldValue: { serverTimestamp: () => serverTimestamp },
  FieldPath: { documentId: () => "__name__" },
  Timestamp: MemoryTimestamp,
};

const tests = [];
function test(name, run) { tests.push({ name, run }); }

const owner = { uid: "owner-a", organizationId: "org-a", role: "OWNER" };
const requestId = "123e4567-e89b-42d3-a456-426614174000";
const form = {
  customerId: "cus_alpha",
  serviceTypeId: "st_ac_repair",
  title: "AC not cooling in main office",
  description: "Unit runs but air stays warm. Access through the rear gate after 9am.",
  priority: "HIGH",
};
const createInput = { ...form, requestId };

function seedReferences(db) {
  const organizationId = owner.organizationId;
  db.seed("customers/cus_alpha", { organizationId, name: "Alpha Traders", nameSearch: "alpha traders", customerNumber: "CUS-000001", isActive: true, version: 1 });
  db.seed("customers/cus_beta", { organizationId, name: "Beta Homes", nameSearch: "beta homes", customerNumber: "CUS-000002", isActive: true, version: 1 });
  db.seed("customers/cus_inactive", { organizationId, name: "Closed Shop", nameSearch: "closed shop", customerNumber: "CUS-000003", isActive: false, version: 1 });
  db.seed("customers/cus_foreign", { organizationId: "org-b", name: "Foreign Co", nameSearch: "foreign co", customerNumber: "CUS-000001", isActive: true, version: 1 });
  db.seed("serviceTypes/st_ac_repair", { organizationId, name: "AC Repair", nameSearch: "ac repair", estimatedDurationMinutes: 90, isActive: true, version: 1 });
  db.seed("serviceTypes/st_solar", { organizationId, name: "Solar Inspection", nameSearch: "solar inspection", estimatedDurationMinutes: 150, isActive: true, version: 1 });
  db.seed("serviceTypes/st_retired", { organizationId, name: "Retired Service", nameSearch: "retired service", estimatedDurationMinutes: 30, isActive: false, version: 1 });
  db.seed("serviceTypes/st_foreign", { organizationId: "org-b", name: "Foreign Service", nameSearch: "foreign service", estimatedDurationMinutes: 30, isActive: true, version: 1 });
}

function fixture(options = {}) {
  const db = new MemoryFirestore();
  seedReferences(db);
  const navigationError = new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  const state = { session: owner, authError: null, authCalls: [], revalidated: [], logged: [] };
  const load = moduleLoader({
    "firebase-admin/firestore": firestoreMock,
    "@/src/lib/firebase/admin": { adminDb: db },
    "@/src/lib/auth/require-auth": {
      requireAuth: async () => {
        state.authCalls.push("requireAuth");
        if (state.authError) throw state.authError;
        return state.session;
      },
    },
    "@/src/lib/auth/authorization": {
      requirePermission: async (permission) => {
        state.authCalls.push(permission);
        if (state.authError) throw state.authError;
        if (!load("src/lib/auth/permissions.ts").hasPermission(state.session.role, permission)) throw navigationError;
        return state.session;
      },
    },
    "next/navigation": { notFound: () => { throw navigationError; } },
    "next/cache": { revalidatePath: (path) => state.revalidated.push(path) },
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
    console: { error: (...args) => state.logged.push(args), warn: (...args) => state.logged.push(args), log() {} },
    ...options.mocks,
  });
  return {
    db, load, state, navigationError,
    repo: load("src/features/service-requests/repositories/service-request.repository.ts"),
    schema: load("src/features/service-requests/schemas/service-request.schema.ts"),
    errors: load("src/features/service-requests/repositories/service-request-errors.ts"),
    workflow: load("src/features/service-requests/utils/request-workflow.ts"),
  };
}

function assertNoWrites(db) {
  assert.equal(db.values("serviceRequests").length, 0);
  assert.equal(db.values("auditLogs").length, 0);
  assert.equal(db.commits.length, 0);
}

function assertTenantQueries(db, organizationId = owner.organizationId) {
  for (const query of db.queries) {
    assert.ok(query.filters.some(({ field, operator, value }) => field === "organizationId" && operator === "==" && value === organizationId), `${query.path}: ${JSON.stringify(query.filters)}`);
  }
}

test("strict schemas normalize titles and reject tenant, status, audit and version fields", () => {
  const { schema } = fixture();
  const parsed = schema.serviceRequestCreateSchema.parse({ ...createInput, title: "  AC   not cooling  ", description: `  ${form.description}  ` });
  assert.equal(parsed.title, "AC not cooling");
  assert.equal(parsed.description, form.description);
  assert.equal(schema.normalizeRequestTitle("  ＡＣ   Not Cooling "), "ac not cooling");
  for (const extra of [
    { organizationId: "org-b" }, { status: "CANCELLED" }, { createdBy: "other" }, { id: "other" },
    { titleSearch: "secret" }, { version: 3 }, { customerName: "Spoofed" }, { requestedAt: "2020-01-01" },
  ]) assert.equal(schema.serviceRequestCreateSchema.safeParse({ ...createInput, ...extra }).success, false, JSON.stringify(extra));
  for (const invalid of [
    { customerId: "" }, { customerId: "../victim" }, { serviceTypeId: "a/b" }, { title: "ab" }, { title: "x".repeat(161) },
    { title: "two\nlines" }, { description: "short" }, { description: "x".repeat(4001) }, { priority: "CRITICAL" }, { requestId: "invalid" },
  ]) assert.equal(schema.serviceRequestCreateSchema.safeParse({ ...createInput, ...invalid }).success, false, JSON.stringify(invalid));
  const missing = schema.serviceRequestFormSchema.safeParse({ ...form, customerId: "" });
  assert.equal(missing.success, false);
  assert.equal(missing.error.issues.find((issue) => issue.path[0] === "customerId")?.message, "Choose a customer.");
  for (const version of [0, -1, 1.5, "1", Number.MAX_SAFE_INTEGER]) {
    assert.equal(schema.serviceRequestUpdateSchema.safeParse({ ...form, version }).success, false);
    assert.equal(schema.serviceRequestTransitionSchema.safeParse({ action: "CANCEL", version }).success, false);
  }
  assert.equal(schema.serviceRequestUpdateSchema.safeParse({ ...form, version: 1, status: "CANCELLED" }).success, false);
  assert.equal(schema.serviceRequestTransitionSchema.safeParse({ action: "SCHEDULE", version: 1 }).success, false);
  assert.equal(schema.serviceRequestOptionsSchema.safeParse({ kind: "memberships" }).success, false);
  assert.equal(schema.serviceRequestOptionsSchema.safeParse({ kind: "customers", q: "", organizationId: "org-b" }).success, false);
});

test("workflow only allows review from NEW and cancellation while editable", () => {
  const { workflow } = fixture();
  assert.equal(workflow.nextServiceRequestStatus("NEW", "START_REVIEW"), "REVIEWING");
  assert.equal(workflow.nextServiceRequestStatus("NEW", "CANCEL"), "CANCELLED");
  assert.equal(workflow.nextServiceRequestStatus("REVIEWING", "CANCEL"), "CANCELLED");
  assert.equal(workflow.nextServiceRequestStatus("REVIEWING", "START_REVIEW"), null);
  for (const status of ["SCHEDULED", "CONVERTED_TO_JOB", "CANCELLED"]) {
    assert.equal(workflow.canEditServiceRequest(status), false);
    assert.equal(workflow.nextServiceRequestStatus(status, "CANCEL"), null);
    assert.equal(workflow.nextServiceRequestStatus(status, "START_REVIEW"), null);
  }
});

test("repository refuses unauthorized or malformed sessions before database I/O", async () => {
  const { repo, db } = fixture();
  db.reads.length = 0;
  for (const session of [
    ...["TECHNICIAN", "ACCOUNTANT", "UNKNOWN"].map((role) => ({ ...owner, role })),
    { ...owner, organizationId: "../victim" }, { ...owner, organizationId: "" }, { ...owner, uid: "" },
  ]) {
    for (const run of [
      () => repo.listServiceRequests(session, { q: "", status: "ALL", priority: "ALL" }),
      () => repo.readServiceRequest(session, "sr_a"),
      () => repo.listServiceRequestOptions(session, { kind: "customers", q: "" }),
      () => repo.createServiceRequest(session, createInput),
      () => repo.updateServiceRequest(session, "sr_a", { ...form, version: 1 }),
      () => repo.transitionServiceRequest(session, "sr_a", { action: "CANCEL", version: 1 }),
    ]) await assert.rejects(run());
  }
  assert.equal(db.reads.length, 0);
  assert.equal(db.queries.length, 0);
  assertNoWrites(db);
  for (const role of ["OWNER", "ADMIN", "MANAGER", "DISPATCHER"]) {
    const page = await repo.listServiceRequests({ ...owner, role }, { q: "", status: "ALL", priority: "ALL" });
    assert.equal(page.requests.length, 0);
  }
});

test("references must be active records of the same tenant and never leak foreign data", async () => {
  const { repo, db, errors } = fixture();
  db.commits.length = 0;
  for (const [input, field] of [
    [{ customerId: "cus_foreign" }, "customerId"], [{ customerId: "cus_inactive" }, "customerId"], [{ customerId: "cus_missing" }, "customerId"],
    [{ serviceTypeId: "st_foreign" }, "serviceTypeId"], [{ serviceTypeId: "st_retired" }, "serviceTypeId"], [{ serviceTypeId: "st_missing" }, "serviceTypeId"],
  ]) {
    await assert.rejects(repo.createServiceRequest(owner, { ...createInput, ...input, requestId: randomUUID() }), (error) => error instanceof errors.ServiceRequestReferenceError && error.field === field && !error.message.includes("Foreign"));
  }
  assertNoWrites(db);
  const created = await repo.createServiceRequest(owner, createInput);
  assert.equal(created.customerName, "Alpha Traders");
  assert.equal(created.customerNumber, "CUS-000001");
  assert.equal(created.serviceTypeName, "AC Repair");
  assert.equal(created.status, "NEW");
  assert.ok(!Object.hasOwn(created, "organizationId"));
  await assert.rejects(repo.updateServiceRequest(owner, created.id, { ...form, customerId: "cus_foreign", version: 1 }), (error) => error instanceof errors.ServiceRequestReferenceError);
  assert.equal(db.records.get(`serviceRequests/${created.id}`).customerId, "cus_alpha");
});

test("foreign and malformed document IDs are hidden from read, update, transition and cursor use", async () => {
  const { repo, db } = fixture();
  const foreign = await repo.createServiceRequest({ ...owner, organizationId: "org-b" }, { ...createInput, customerId: "cus_foreign", serviceTypeId: "st_foreign" });
  db.queries.length = 0;
  db.commits.length = 0;
  for (const id of [foreign.id, "missing", "../foreign", "a/b"]) {
    await assert.rejects(repo.readServiceRequest(owner, id));
    await assert.rejects(repo.updateServiceRequest(owner, id, { ...form, version: 1 }));
    await assert.rejects(repo.transitionServiceRequest(owner, id, { action: "CANCEL", version: 1 }));
  }
  await assert.rejects(repo.listServiceRequests(owner, { q: "", status: "ALL", priority: "ALL", cursor: foreign.id }));
  await assert.rejects(repo.listServiceRequestOptions(owner, { kind: "customers", q: "", cursor: "cus_foreign" }));
  assert.equal(db.commits.length, 0);
  assert.ok(db.reads.every((path) => !path.includes("../")));
  assert.equal(db.records.get(`serviceRequests/${foreign.id}`).organizationId, "org-b");
  assert.equal(db.records.get(`serviceRequests/${foreign.id}`).status, "NEW");
});

test("listing is tenant-scoped, newest first, title-searchable, filterable and cursor-safe", async () => {
  const { repo, db } = fixture();
  const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
  for (let index = 0; index < 54; index++) {
    const created = await repo.createServiceRequest(owner, { ...createInput, title: `Request ${String(index).padStart(3, "0")}`, priority: priorities[index % 4], requestId: randomUUID() });
    db.records.get(`serviceRequests/${created.id}`).requestedAt = new MemoryTimestamp(new Date(commitDate.getTime() + index * 60_000));
  }
  await repo.createServiceRequest({ ...owner, organizationId: "org-b" }, { ...createInput, title: "Request 005", customerId: "cus_foreign", serviceTypeId: "st_foreign" });
  db.queries.length = 0;
  const titles = [];
  let cursor;
  do {
    const page = await repo.listServiceRequests(owner, { q: "", status: "ALL", priority: "ALL", ...(cursor ? { cursor } : {}) });
    assert.ok(page.requests.length <= 25);
    assert.ok(page.requests.every((entry) => !Object.hasOwn(entry, "organizationId")));
    titles.push(...page.requests.map((entry) => entry.title));
    cursor = page.nextCursor;
    assert.ok(titles.length <= 54, "pagination must make forward progress");
  } while (cursor);
  assert.equal(titles.length, 54);
  assert.equal(new Set(titles).size, 54);
  assert.equal(JSON.stringify(titles), JSON.stringify([...titles].sort().reverse()), "queue is newest first");
  assertTenantQueries(db);
  for (const query of db.queries) assert.ok(query.maximum <= 26);
  const searched = await repo.listServiceRequests(owner, { q: " Request 00 ", status: "ALL", priority: "ALL" });
  assert.equal(searched.requests.length, 10);
  assert.equal(JSON.stringify(searched.requests.map((entry) => entry.title)), JSON.stringify(searched.requests.map((entry) => entry.title).sort()), "search is ordered by title");
  const urgent = await repo.listServiceRequests(owner, { q: "", status: "NEW", priority: "URGENT" });
  assert.ok(urgent.requests.length > 0 && urgent.requests.every((entry) => entry.priority === "URGENT" && entry.status === "NEW"));
  const nothing = await repo.listServiceRequests(owner, { q: "", status: "CANCELLED", priority: "ALL" });
  assert.equal(nothing.requests.length, 0);
  await assert.rejects(repo.listServiceRequests(owner, { q: "", status: "ALL", priority: "LOW", cursor: urgent.requests[0].id }));
  await assert.rejects(repo.listServiceRequests(owner, { q: "zzz", status: "ALL", priority: "ALL", cursor: urgent.requests[0].id }));
});

test("options expose only active same-tenant customers and service types", async () => {
  const { repo, db } = fixture();
  db.queries.length = 0;
  const customers = await repo.listServiceRequestOptions(owner, { kind: "customers", q: "" });
  assert.equal(JSON.stringify(customers.options.map((option) => option.id)), JSON.stringify(["cus_alpha", "cus_beta"]));
  assert.equal(customers.options[0].secondary, "CUS-000001");
  assert.equal(customers.nextCursor, null);
  const serviceTypes = await repo.listServiceRequestOptions(owner, { kind: "serviceTypes", q: " SOL " });
  assert.equal(JSON.stringify(serviceTypes.options), JSON.stringify([{ id: "st_solar", name: "Solar Inspection", secondary: "2 hr 30 min" }]));
  assertTenantQueries(db);
  for (const query of db.queries) assert.ok(query.filters.some(({ field, value }) => field === "isActive" && value === true));
  for (let index = 0; index < 12; index++) {
    db.seed(`customers/cus_page_${index}`, { organizationId: owner.organizationId, name: `Zeta ${index}`, nameSearch: `zeta ${index}`, customerNumber: `CUS-1000${index}`, isActive: true, version: 1 });
  }
  const first = await repo.listServiceRequestOptions(owner, { kind: "customers", q: "zeta" });
  assert.equal(first.options.length, 10);
  assert.ok(first.nextCursor);
  const second = await repo.listServiceRequestOptions(owner, { kind: "customers", q: "zeta", cursor: first.nextCursor });
  assert.equal(second.options.length, 2);
  assert.equal(second.nextCursor, null);
  await assert.rejects(repo.listServiceRequestOptions(owner, { kind: "customers", q: "alpha", cursor: first.nextCursor }));
  await assert.rejects(repo.listServiceRequestOptions(owner, { kind: "customers", q: "", cursor: "cus_inactive" }));
});

test("create is idempotent, atomic with audit, and keeps descriptions out of audit logs", async () => {
  const { repo, db } = fixture();
  db.retryNextTransaction = true;
  const first = await repo.createServiceRequest(owner, createInput);
  assert.equal(first.version, 1);
  assert.equal(db.values("serviceRequests").length, 1);
  assert.equal(db.values("auditLogs").length, 1);
  assert.equal(db.commits.length, 1);
  const repeated = await repo.createServiceRequest(owner, createInput);
  assert.equal(repeated.id, first.id);
  assert.equal(db.values("auditLogs").length, 1);
  await assert.rejects(repo.createServiceRequest(owner, { ...createInput, title: "Different title for the same request id" }));
  assert.equal(db.values("serviceRequests").length, 1);
  // A completed request stays replayable after its customer is deactivated.
  db.records.get("customers/cus_alpha").isActive = false;
  assert.equal((await repo.createServiceRequest(owner, createInput)).id, first.id);
  const audit = db.values("auditLogs")[0].data;
  assert.equal(audit.organizationId, owner.organizationId);
  assert.equal(audit.actorUserId, owner.uid);
  assert.equal(audit.action, "SERVICE_REQUEST_CREATED");
  assert.equal(audit.entityType, "SERVICE_REQUEST");
  assert.equal(audit.entityId, first.id);
  assert.ok(!JSON.stringify(audit).includes(form.description));
  assert.ok(!JSON.stringify(audit).includes(form.title));
  const stored = db.records.get(`serviceRequests/${first.id}`);
  assert.equal(stored.organizationId, owner.organizationId);
  assert.equal(stored.titleSearch, "ac not cooling in main office");
  assert.ok(stored.requestedAt instanceof MemoryTimestamp);
});

test("failed create commits leave no request or audit", async () => {
  const { repo, db } = fixture();
  db.failNextCommit = true;
  await assert.rejects(repo.createServiceRequest(owner, createInput));
  assertNoWrites(db);
  const created = await repo.createServiceRequest(owner, createInput);
  assert.equal(created.title, form.title);
  assert.equal(db.values("auditLogs").length, 1);
});

test("updates use versions, re-validate only changed references and refresh snapshots", async () => {
  const { repo, db, errors } = fixture();
  const created = await repo.createServiceRequest(owner, createInput);
  const unchanged = await repo.updateServiceRequest(owner, created.id, { ...form, version: 1 });
  assert.equal(unchanged.version, 1);
  assert.equal(db.values("auditLogs").length, 1);
  db.records.get("customers/cus_alpha").isActive = false;
  const retitled = await repo.updateServiceRequest(owner, created.id, { ...form, title: "AC still not cooling", version: 1 });
  assert.equal(retitled.version, 2);
  assert.equal(retitled.customerName, "Alpha Traders", "unchanged reference keeps its snapshot even if deactivated");
  assert.equal(db.records.get(`serviceRequests/${created.id}`).titleSearch, "ac still not cooling");
  await assert.rejects(repo.updateServiceRequest(owner, created.id, { ...form, version: 1 }), (error) => error instanceof errors.ServiceRequestConflictError);
  const moved = await repo.updateServiceRequest(owner, created.id, { ...form, title: "AC still not cooling", customerId: "cus_beta", serviceTypeId: "st_solar", version: 2 });
  assert.equal(moved.version, 3);
  assert.equal(moved.customerName, "Beta Homes");
  assert.equal(moved.customerNumber, "CUS-000002");
  assert.equal(moved.serviceTypeName, "Solar Inspection");
  const audit = db.values("auditLogs").at(-1).data;
  assert.equal(audit.action, "SERVICE_REQUEST_UPDATED");
  assert.equal(JSON.stringify(audit.metadata.changedFields), JSON.stringify(["customerId", "serviceTypeId"]));
  assert.equal(db.values("auditLogs").length, 3);
});

test("transitions are versioned, audited, and lock the record after cancellation", async () => {
  const { repo, db, errors } = fixture();
  const created = await repo.createServiceRequest(owner, createInput);
  await assert.rejects(repo.transitionServiceRequest(owner, created.id, { action: "CANCEL", version: 5 }), (error) => error instanceof errors.ServiceRequestConflictError);
  const reviewing = await repo.transitionServiceRequest(owner, created.id, { action: "START_REVIEW", version: 1 });
  assert.equal(reviewing.status, "REVIEWING");
  assert.equal(reviewing.version, 2);
  await assert.rejects(repo.transitionServiceRequest(owner, created.id, { action: "START_REVIEW", version: 2 }), (error) => error instanceof errors.ServiceRequestTransitionError);
  const edited = await repo.updateServiceRequest(owner, created.id, { ...form, priority: "URGENT", version: 2 });
  assert.equal(edited.version, 3);
  const cancelled = await repo.transitionServiceRequest(owner, created.id, { action: "CANCEL", version: 3 });
  assert.equal(cancelled.status, "CANCELLED");
  await assert.rejects(repo.updateServiceRequest(owner, created.id, { ...form, title: "Edit after cancel", version: 4 }), (error) => error instanceof errors.ServiceRequestTransitionError);
  await assert.rejects(repo.transitionServiceRequest(owner, created.id, { action: "CANCEL", version: 4 }), (error) => error instanceof errors.ServiceRequestTransitionError);
  const audits = db.values("auditLogs").map((entry) => entry.data);
  assert.equal(audits.filter((entry) => entry.action === "SERVICE_REQUEST_STATUS_CHANGED").length, 2);
  const last = audits.at(-1);
  assert.equal(JSON.stringify(last.metadata), JSON.stringify({ action: "CANCEL", from: "REVIEWING", to: "CANCELLED", version: 4 }));
  assert.equal(db.records.get(`serviceRequests/${created.id}`).status, "CANCELLED");
});

test("simultaneous transitions on the same version cannot both succeed", async () => {
  const { repo, db } = fixture();
  const created = await repo.createServiceRequest(owner, createInput);
  const outcomes = await Promise.allSettled([
    repo.transitionServiceRequest(owner, created.id, { action: "START_REVIEW", version: 1 }),
    repo.transitionServiceRequest(owner, created.id, { action: "CANCEL", version: 1 }),
  ]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((result) => result.status === "rejected").length, 1);
  assert.equal(db.records.get(`serviceRequests/${created.id}`).version, 2);
});

test("API rejects cross-site mutations and forbidden roles", async () => {
  const { load, state, db } = fixture();
  const api = load("src/features/service-requests/services/service-request-api.ts");
  const requestFor = ({ origin = "https://serviceflow.example", site = "same-origin", host = "serviceflow.example", protocol = "https" } = {}) => {
    const headers = new Headers({ host, "x-forwarded-proto": protocol, "content-type": "application/json" });
    if (origin) headers.set("origin", origin);
    if (site) headers.set("sec-fetch-site", site);
    return { headers, nextUrl: new URL("http://localhost:3005/api/service-requests"), json: async () => createInput };
  };
  assert.equal(api.isServiceRequestRequestSameOrigin(requestFor()), true);
  assert.equal(api.isServiceRequestRequestSameOrigin(requestFor({ origin: "https://evil.example" })), false);
  assert.equal(api.isServiceRequestRequestSameOrigin(requestFor({ site: "cross-site" })), false);
  assert.equal(api.isServiceRequestRequestSameOrigin(requestFor({ origin: null, site: "same-site" })), false);
  state.session = { ...owner, role: "TECHNICIAN" };
  const routes = load("src/app/api/service-requests/route.ts");
  assert.ok([401, 403, 404].includes((await routes.POST(requestFor())).status));
  const options = load("src/app/api/service-requests/options/route.ts");
  const optionsRequest = { headers: new Headers(), nextUrl: new URL("http://localhost:3005/api/service-requests/options?kind=customers&q=") };
  assert.equal((await options.GET(optionsRequest)).status, 403);
  assertNoWrites(db);
});

test("HTTP boundaries validate bodies and query parameters and preserve authentication failures", async () => {
  const { load, state, db } = fixture();
  const route = load("src/app/api/service-requests/route.ts");
  const patch = load("src/app/api/service-requests/[serviceRequestId]/route.ts");
  const transition = load("src/app/api/service-requests/[serviceRequestId]/transition/route.ts");
  const options = load("src/app/api/service-requests/options/route.ts");
  function request(body, headers = {}) {
    const value = new Request("https://serviceflow.example/api/service-requests", { method: "POST", headers: { host: "serviceflow.example", "x-forwarded-proto": "https", origin: "https://serviceflow.example", "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
    value.nextUrl = new URL(value.url);
    return value;
  }
  function optionsRequest(query) {
    return { headers: new Headers(), nextUrl: new URL(`https://serviceflow.example/api/service-requests/options?${query}`) };
  }
  state.authError = new Error("LOGIN_REDIRECT");
  await assert.rejects(route.POST(request(createInput)), (error) => error === state.authError);
  await assert.rejects(options.GET(optionsRequest("kind=customers")), (error) => error === state.authError);
  state.authError = null;
  assert.equal((await route.POST(request("{bad"))).status, 400);
  assert.equal((await route.POST(request(createInput, { "content-type": "text/plain" }))).status, 415);
  assert.equal((await route.POST(request("x".repeat(40000)))).status, 413);
  assert.equal((await route.POST(request({ ...createInput, organizationId: "org-b" }))).status, 400);
  assert.equal((await options.GET(optionsRequest("kind=users"))).status, 400);
  assert.equal((await options.GET(optionsRequest("kind=customers&cursor=../x"))).status, 400);
  assertNoWrites(db);
  const listed = await options.GET(optionsRequest("kind=serviceTypes&q=ac"));
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get("cache-control"), "no-store");
  assert.equal(JSON.stringify((await listed.json()).options.map((option) => option.id)), JSON.stringify(["st_ac_repair"]));
  const invalidReference = await route.POST(request({ ...createInput, customerId: "cus_inactive" }));
  assert.equal(invalidReference.status, 409);
  assert.equal(JSON.stringify(await invalidReference.json()), JSON.stringify({ message: "Choose an active customer from your workspace.", code: "INVALID_REFERENCE", field: "customerId" }));
  const createdResponse = await route.POST(request(createInput));
  assert.equal(createdResponse.status, 201);
  assert.equal(createdResponse.headers.get("cache-control"), "no-store");
  const { serviceRequest } = await createdResponse.json();
  assert.equal(serviceRequest.status, "NEW");
  assert.ok(state.revalidated.includes("/protected/dashboard"));
  const context = { params: Promise.resolve({ serviceRequestId: serviceRequest.id }) };
  const updated = await patch.PATCH(request({ ...form, priority: "URGENT", version: 1 }), context);
  assert.equal(updated.status, 200);
  assert.equal((await patch.PATCH(request({ ...form, version: 1 }), context)).status, 409);
  assert.equal((await transition.POST(request({ action: "SCHEDULE", version: 2 }), context)).status, 400);
  const cancelled = await transition.POST(request({ action: "CANCEL", version: 2 }), context);
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).serviceRequest.status, "CANCELLED");
  const locked = await patch.PATCH(request({ ...form, version: 3 }), context);
  assert.equal(locked.status, 409);
  assert.equal((await locked.json()).code, "TRANSITION");
  state.session = { ...owner, organizationId: "org-b" };
  assert.equal((await patch.PATCH(request({ ...form, version: 3 }), context)).status, 404);
  assert.equal((await transition.POST(request({ action: "CANCEL", version: 3 }), context)).status, 404);
  state.session = owner;
  db.failNextCommit = true;
  const failed = await route.POST(request({ ...createInput, requestId: randomUUID() }));
  assert.equal(failed.status, 500);
  assert.ok(!(await failed.text()).includes("secret database"));
});

let passed = 0;
for (const { name, run } of tests) {
  try {
    await run();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}
assert.ok(tests.length >= 12, "Service Request tests must not be empty or incomplete");
console.log(`Service Request repository checks passed: ${passed}/${tests.length}.`);
