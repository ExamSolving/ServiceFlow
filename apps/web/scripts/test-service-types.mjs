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
const form = {
  name: "AC Repair",
  description: "Diagnose and repair air conditioners.",
  estimatedDurationMinutes: 90,
  isActive: true,
};
const requestId = "123e4567-e89b-42d3-a456-426614174000";
const createInput = { ...form, requestId };

function fixture(options = {}) {
  const db = new MemoryFirestore();
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
    repo: load("src/features/service-types/repositories/service-type.repository.ts"),
    schema: load("src/features/service-types/schemas/service-type.schema.ts"),
    errors: load("src/features/service-types/repositories/service-type-errors.ts"),
  };
}

function assertNoWrites(db) {
  assert.equal(db.values("serviceTypes").length, 0);
  assert.equal(db.values("serviceTypeNames").length, 0);
  assert.equal(db.values("auditLogs").length, 0);
  assert.equal(db.commits.length, 0);
}

function assertTenantQueries(db, organizationId = owner.organizationId) {
  for (const query of db.queries.filter((entry) => entry.path === "serviceTypes")) {
    assert.ok(query.filters.some(({ field, operator, value }) => field === "organizationId" && operator === "==" && value === organizationId), JSON.stringify(query.filters));
  }
}

test("strict schemas reject client tenant, identity, audit and version fields", () => {
  const { schema } = fixture();
  const parsed = schema.serviceTypeCreateSchema.parse({ ...createInput, name: "  AC   Repair  ", description: "  Diagnose units.  " });
  assert.equal(parsed.name, "AC Repair");
  assert.equal(parsed.description, "Diagnose units.");
  for (const extra of [
    { organizationId: "org-b" }, { createdBy: "other" }, { id: "other" },
    { nameSearch: "secret" }, { version: 900 },
  ]) assert.equal(schema.serviceTypeCreateSchema.safeParse({ ...createInput, ...extra }).success, false, JSON.stringify(extra));
  for (const invalid of [
    { name: "" }, { name: "x".repeat(121) }, { name: "bad\nname" },
    { estimatedDurationMinutes: 0 }, { estimatedDurationMinutes: -5 }, { estimatedDurationMinutes: 1.5 },
    { estimatedDurationMinutes: "90" }, { isActive: "true" }, { requestId: "invalid" },
  ]) assert.equal(schema.serviceTypeCreateSchema.safeParse({ ...createInput, ...invalid }).success, false, JSON.stringify(invalid));
  for (const version of [0, -1, 1.5, "1", Number.MAX_SAFE_INTEGER]) {
    assert.equal(schema.serviceTypeUpdateSchema.safeParse({ ...form, version }).success, false);
  }
  assert.equal(schema.serviceTypeUpdateSchema.safeParse({ ...form, version: 1, organizationId: "org-b" }).success, false);
});

test("repository refuses unauthorized or malformed sessions before database I/O", async () => {
  const { repo, db } = fixture();
  for (const session of [
    ...["DISPATCHER", "TECHNICIAN", "ACCOUNTANT", "UNKNOWN"].map((role) => ({ ...owner, role })),
    { ...owner, organizationId: "../victim" }, { ...owner, organizationId: "" }, { ...owner, uid: "" },
  ]) {
    for (const run of [
      () => repo.listServiceTypes(session, { q: "", status: "ALL" }),
      () => repo.readServiceType(session, "service-type-a"),
      () => repo.createServiceType(session, createInput),
      () => repo.updateServiceType(session, "service-type-a", { ...form, version: 1 }),
    ]) await assert.rejects(run());
  }
  assert.equal(db.reads.length, 0);
  assert.equal(db.queries.length, 0);
  assertNoWrites(db);
  for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
    const page = await repo.listServiceTypes({ ...owner, role }, { q: "", status: "ALL" });
    assert.equal(page.serviceTypes.length, 0);
  }
});

test("foreign and malformed document IDs are hidden from read, update and cursor use", async () => {
  const { repo, db } = fixture();
  const foreign = await repo.createServiceType({ ...owner, organizationId: "org-b" }, createInput);
  db.queries.length = 0;
  db.commits.length = 0;
  for (const id of [foreign.id, "missing", "../foreign", "a/b"]) {
    await assert.rejects(repo.readServiceType(owner, id));
    await assert.rejects(repo.updateServiceType(owner, id, { ...form, version: 1 }));
  }
  await assert.rejects(repo.listServiceTypes(owner, { q: "", status: "ALL", cursor: foreign.id }));
  assert.equal(db.commits.length, 0);
  assert.ok(db.reads.every((path) => !path.includes("../")));
  assert.equal(db.records.get(`serviceTypes/${foreign.id}`).organizationId, "org-b");
});

test("listing remains tenant-scoped, bounded, ordered and cursor-safe", async () => {
  const { repo, db } = fixture();
  for (let index = 0; index < 54; index++) {
    await repo.createServiceType(owner, {
      ...form, name: `Maintenance ${String(index).padStart(3, "0")}`,
      isActive: index % 2 === 0,
      requestId: randomUUID(),
    });
  }
  await repo.createServiceType({ ...owner, organizationId: "org-b" }, { ...createInput, name: "Maintenance 005" });
  db.queries.length = 0;
  const names = [];
  let cursor;
  do {
    const page = await repo.listServiceTypes(owner, { q: "", status: "ALL", ...(cursor ? { cursor } : {}) });
    assert.ok(page.serviceTypes.length <= 25);
    assert.ok(page.serviceTypes.every((entry) => !Object.hasOwn(entry, "organizationId")));
    names.push(...page.serviceTypes.map((entry) => entry.name));
    cursor = page.nextCursor;
    assert.ok(names.length <= 54, "pagination must make forward progress");
  } while (cursor);
  assert.equal(names.length, 54);
  assert.equal(new Set(names).size, 54);
  assert.equal(JSON.stringify(names), JSON.stringify([...names].sort()));
  assertTenantQueries(db);
  for (const query of db.queries) assert.ok(query.maximum <= 26);
  const active = await repo.listServiceTypes(owner, { q: " Maintenance 00 ", status: "ACTIVE" });
  assert.equal(active.serviceTypes.length, 5);
  assert.ok(active.serviceTypes.every((entry) => entry.isActive && entry.name.startsWith("Maintenance 00")));
  await assert.rejects(repo.listServiceTypes(owner, { q: "", status: "ACTIVE", cursor: names.at(-1) }));
});

test("normalized names are unique per tenant across active and inactive services", async () => {
  const { repo, db } = fixture();
  const first = await repo.createServiceType(owner, createInput);
  assert.equal(first.name, form.name);
  const before = db.values("auditLogs").length;
  for (const name of ["ac repair", " AC   REPAIR ", "ＡＣ Repair"]) {
    await assert.rejects(repo.createServiceType(owner, { ...createInput, name, requestId: randomUUID(), isActive: false }));
  }
  assert.equal(db.values("serviceTypes").length, 1);
  assert.equal(db.values("serviceTypeNames").length, 1);
  assert.equal(db.values("auditLogs").length, before);
  const secondTenant = await repo.createServiceType({ ...owner, organizationId: "org-b" }, createInput);
  assert.notEqual(secondTenant.id, first.id);
  assert.equal(db.values("serviceTypes").length, 2);
  assert.equal(db.values("serviceTypeNames").length, 2);
});

test("create is idempotent, writes profile/name/audit atomically and masks PII in audit", async () => {
  const { repo, db } = fixture();
  db.retryNextTransaction = true;
  const first = await repo.createServiceType(owner, createInput);
  assert.equal(first.version, 1);
  assert.equal(db.values("serviceTypes").length, 1);
  assert.equal(db.values("serviceTypeNames").length, 1);
  assert.equal(db.values("auditLogs").length, 1);
  assert.equal(db.commits.length, 1);
  const repeated = await repo.createServiceType(owner, createInput);
  assert.equal(repeated.id, first.id);
  assert.equal(db.values("auditLogs").length, 1);
  assert.equal(db.commits.length, 2);
  await assert.rejects(repo.createServiceType(owner, { ...createInput, name: "Other name" }));
  assert.equal(db.values("serviceTypes").length, 1);
  assert.equal(db.values("auditLogs").length, 1);
  const audit = db.values("auditLogs")[0].data;
  assert.equal(audit.organizationId, owner.organizationId);
  assert.equal(audit.actorUserId, owner.uid);
  assert.equal(audit.action, "SERVICE_TYPE_CREATED");
  assert.equal(audit.entityType, "SERVICE_TYPE");
  assert.equal(audit.entityId, first.id);
  assert.ok(!JSON.stringify(audit).includes(form.description));
});

test("failed create commits leave no profile, name reservation, or audit", async () => {
  const { repo, db } = fixture();
  db.failNextCommit = true;
  await assert.rejects(repo.createServiceType(owner, createInput));
  assertNoWrites(db);
  const created = await repo.createServiceType(owner, createInput);
  assert.equal(created.name, form.name);
  assert.equal(db.values("auditLogs").length, 1);
});

test("simultaneous duplicate names cannot create two records", async () => {
  const { repo, db } = fixture();
  const outcomes = await Promise.allSettled([
    repo.createServiceType(owner, { ...createInput, requestId: randomUUID() }),
    repo.createServiceType(owner, { ...createInput, requestId: randomUUID(), name: " ac REPAIR " }),
  ]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((result) => result.status === "rejected").length, 1);
  assert.equal(db.values("serviceTypes").length, 1);
  assert.equal(db.values("serviceTypeNames").length, 1);
  assert.equal(db.values("auditLogs").length, 1);
});

test("updates use versions and transfer name reservations only on successful rename", async () => {
  const { repo, db } = fixture();
  const first = await repo.createServiceType(owner, createInput);
  const second = await repo.createServiceType(owner, { ...createInput, requestId: randomUUID(), name: "Solar Inspection" });
  const unchanged = await repo.updateServiceType(owner, first.id, { ...form, version: 1 });
  assert.equal(unchanged.version, 1);
  assert.equal(db.values("auditLogs").length, 2);
  await assert.rejects(repo.updateServiceType(owner, first.id, { ...form, version: 1, name: "solar inspection" }));
  assert.equal(db.records.get(`serviceTypes/${first.id}`).name, form.name);
  assert.equal(db.values("serviceTypeNames").length, 2);
  const renamed = await repo.updateServiceType(owner, first.id, { ...form, version: 1, name: "Plumbing Emergency" });
  assert.equal(renamed.version, 2);
  assert.equal(renamed.name, "Plumbing Emergency");
  assert.equal(db.values("serviceTypeNames").length, 2);
  assert.equal(db.values("auditLogs").length, 3);
  await assert.rejects(repo.updateServiceType(owner, first.id, { ...form, version: 1 }));
  const restoredName = await repo.createServiceType(owner, { ...createInput, requestId: randomUUID() });
  assert.notEqual(restoredName.id, first.id);
  await assert.rejects(repo.updateServiceType(owner, second.id, { ...form, name: "Plumbing Emergency", version: 1 }));
  assert.equal(db.values("auditLogs").length, 4);
});

test("failed renames leave the original record, both name reservations and audit untouched", async () => {
  const { repo, db } = fixture();
  const first = await repo.createServiceType(owner, createInput);
  const original = JSON.stringify(db.records.get(`serviceTypes/${first.id}`));
  const reservations = JSON.stringify(db.values("serviceTypeNames"));
  db.failNextCommit = true;
  await assert.rejects(repo.updateServiceType(owner, first.id, { ...form, name: "Solar Repair", version: 1 }));
  assert.equal(JSON.stringify(db.records.get(`serviceTypes/${first.id}`)), original);
  assert.equal(JSON.stringify(db.values("serviceTypeNames")), reservations);
  assert.equal(db.values("auditLogs").length, 1);
});

test("API rejects cross-site mutations and forbidden roles", async () => {
  const { load, state, db } = fixture();
  const api = load("src/features/service-types/services/service-type-api.ts");
  const requestFor = ({ origin = "https://serviceflow.example", site = "same-origin", host = "serviceflow.example", protocol = "https" } = {}) => {
    const headers = new Headers({ host, "x-forwarded-proto": protocol, "content-type": "application/json" });
    if (origin) headers.set("origin", origin);
    if (site) headers.set("sec-fetch-site", site);
    return { headers, nextUrl: new URL("http://localhost:3005/api/service-types"), json: async () => createInput };
  };
  assert.equal(api.isServiceTypeRequestSameOrigin(requestFor()), true);
  assert.equal(api.isServiceTypeRequestSameOrigin(requestFor({ origin: "https://evil.example" })), false);
  assert.equal(api.isServiceTypeRequestSameOrigin(requestFor({ site: "cross-site" })), false);
  assert.equal(api.isServiceTypeRequestSameOrigin(requestFor({ origin: null, site: "same-site" })), false);
  state.session = { ...owner, role: "TECHNICIAN" };
  const routes = load("src/app/api/service-types/route.ts");
  const response = await routes.POST(requestFor());
  assert.ok([401, 403, 404].includes(response.status));
  assertNoWrites(db);
});

test("HTTP boundaries validate streamed bodies and preserve authentication failures", async () => {
  const { load, state, db } = fixture();
  const route = load("src/app/api/service-types/route.ts");
  const patch = load("src/app/api/service-types/[serviceTypeId]/route.ts");
  function request(body, headers = {}) {
    const value = new Request("https://serviceflow.example/api/service-types", { method: "POST", headers: { host: "serviceflow.example", "x-forwarded-proto": "https", origin: "https://serviceflow.example", "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
    value.nextUrl = new URL(value.url);
    return value;
  }
  state.authError = new Error("LOGIN_REDIRECT");
  await assert.rejects(route.POST(request(createInput)), (error) => error === state.authError);
  state.authError = null;
  assert.equal((await route.POST(request("{bad"))).status, 400);
  assert.equal((await route.POST(request(createInput, { "content-type": "text/plain" }))).status, 415);
  assert.equal((await route.POST(request("x".repeat(17000)))).status, 413);
  assert.equal((await route.POST(request({ ...createInput, organizationId: "org-b" }))).status, 400);
  assertNoWrites(db);
  const createdResponse = await route.POST(request(createInput));
  assert.equal(createdResponse.status, 201);
  assert.equal(createdResponse.headers.get("cache-control"), "no-store");
  const { serviceType } = await createdResponse.json();
  const duplicate = await route.POST(request({ ...createInput, requestId: randomUUID() }));
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, "DUPLICATE_NAME");
  const context = { params: Promise.resolve({ serviceTypeId: serviceType.id }) };
  const updated = await patch.PATCH(request({ ...form, isActive: false, version: 1 }), context);
  assert.equal(updated.status, 200);
  assert.equal((await patch.PATCH(request({ ...form, version: 1 }), context)).status, 409);
  state.session = { ...owner, organizationId: "org-b" };
  assert.equal((await patch.PATCH(request({ ...form, version: 2 }), context)).status, 404);
  state.session = owner;
  db.failNextCommit = true;
  const failed = await route.POST(request({ ...createInput, name: "New service", requestId: randomUUID() }));
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
assert.ok(tests.length >= 10, "Service Type tests must not be empty or incomplete");
console.log(`Service Type repository checks passed: ${passed}/${tests.length}.`);
