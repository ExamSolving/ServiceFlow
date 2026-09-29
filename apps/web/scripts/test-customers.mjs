import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function clone(value) {
  if (value instanceof MemoryTimestamp) return new MemoryTimestamp(value.toDate());
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

// Execute the real TypeScript modules with only framework/session/Firestore
// I/O replaced. Schema validation, tenancy, queries, and write logic stay real.
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
      module: moduleRecord, exports: moduleRecord.exports, Buffer, URL, Request, Response, Headers, Date, Intl,
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

const serverTimestamp = { __serverTimestamp: true };
const commitDate = new Date("2026-09-29T12:00:00.000Z");
class MemoryTimestamp {
  constructor(date) { this.date = new Date(date); }
  static now() { return new MemoryTimestamp(commitDate); }
  static fromDate(date) { return new MemoryTimestamp(date); }
  toDate() { return new Date(this.date); }
  toMillis() { return this.date.getTime(); }
}
function materialize(value) {
  if (value?.__serverTimestamp) return new Date(commitDate);
  if (value instanceof MemoryTimestamp) return clone(value);
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(materialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item)]));
  }
  return value;
}

// Stage writes, validate every operation, then commit atomically. A failed or
// retried callback discards the whole staged batch. Refuse reads after writes.
class MemoryFirestore {
  records = new Map();
  queries = [];
  reads = [];
  commits = [];
  sequence = 0;
  failNextCommit = false;
  retryNextTransaction = false;
  seed(path, data) { this.records.set(path, clone(data)); }
  collection(name) { return new MemoryQuery(this, name); }
  doc(path) { return new MemoryDocument(this, path); }
  values(collection) {
    return [...this.records.entries()]
      .filter(([path]) => path.split("/").length === 2 && path.startsWith(`${collection}/`))
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
    const execute = async () => {
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
      return { result, writes };
    };
    if (this.retryNextTransaction) {
      this.retryNextTransaction = false;
      await execute();
    }
    const { result, writes } = await execute();
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
    this.commits.push(writes.map(({ type, path, data }) => ({ type, path, data: materialize(data) })));
    return result;
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
  next(changes) {
    return Object.assign(new MemoryQuery(this.db, this.path, this.filters, this.order, this.maximum, this.cursor), changes);
  }
  doc(id) { return new MemoryDocument(this.db, `${this.path}/${id ?? `auto-${++this.db.sequence}`}`); }
  where(field, operator, value) { return this.next({ filters: [...this.filters, { field, operator, value }] }); }
  orderBy(field, direction = "asc") { return this.next({ order: [...this.order, { field, direction }] }); }
  limit(maximum) { return this.next({ maximum }); }
  startAfter(...cursor) { return this.next({ cursor }); }
  async get() {
    this.db.queries.push({ path: this.path, filters: this.filters, order: this.order, maximum: this.maximum, cursor: this.cursor });
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

const owner = { uid: "user-a", organizationId: "org-a", role: "OWNER" };
const form = { type: "BUSINESS", name: "Acme Services", email: "hello@example.com", phone: "+91 98765 43210", notes: "Ring reception on arrival.", isActive: true };
const requestId = "123e4567-e89b-42d3-a456-426614174000";
const createInput = { ...form, requestId };
function fixture() {
  const db = new MemoryFirestore();
  const load = moduleLoader({ "firebase-admin/firestore": firestoreMock, "@/src/lib/firebase/admin": { adminDb: db } });
  return {
    db, load,
    repo: load("src/features/customers/repositories/customer.repository.ts"),
    schema: load("src/features/customers/schemas/customer.schema.ts"),
    errors: load("src/features/customers/repositories/customer-errors.ts"),
  };
}
function seedCustomer(db, id, overrides = {}) {
  const fields = { ...form, ...overrides };
  db.seed(`customers/${id}`, {
    organizationId: owner.organizationId, customerNumber: "CUS-000001", version: 1,
    createdAt: MemoryTimestamp.now(), updatedAt: MemoryTimestamp.now(),
    ...fields, nameSearch: fields.name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(),
  });
}
const tests = [];
function test(name, run) { tests.push({ name, run }); }

test("strict schemas validate and normalize safe customer inputs", () => {
  const { schema } = fixture();
  const parsed = schema.customerCreateSchema.parse({ ...createInput, name: "  Acme Services  ", email: " hello@example.com " });
  assert.equal(parsed.name, form.name);
  assert.equal(parsed.email, form.email);
  assert.equal(schema.normalizeCustomerName("  ＡＣＭＥ   Services  "), "acme services");
  assert.equal(schema.customerFormSchema.safeParse({ ...form, email: "" }).success, true);
  for (const input of [
    { ...createInput, organizationId: "victim" }, { ...createInput, createdBy: "victim" },
    { ...createInput, version: 99 }, { ...createInput, requestId: "invalid" },
    { ...createInput, name: "x" }, { ...createInput, name: "a\nb" },
    { ...createInput, email: "invalid@" }, { ...createInput, phone: "12" },
    { ...createInput, phone: "abc1234567" }, { ...createInput, phone: "1234567890123456" },
    { ...createInput, isActive: "true" }, { ...createInput, notes: "bad\0note" },
    { ...createInput, notes: "x".repeat(2001) }, { ...createInput, type: "UNKNOWN" },
  ]) assert.equal(schema.customerCreateSchema.safeParse(input).success, false, JSON.stringify(input));
  for (const version of [0, -1, 1.1, Number.MAX_SAFE_INTEGER, "1"]) {
    assert.equal(schema.customerUpdateSchema.safeParse({ ...form, version }).success, false);
  }
  assert.equal(schema.customerUpdateSchema.safeParse({ ...form, version: 1, organizationId: "victim" }).success, false);
  for (const id of ["", "../customer", "a/b", "..", "has space", "x".repeat(129)]) {
    assert.equal(schema.customerIdSchema.safeParse(id).success, false, id);
  }
});

test("repository denies unauthorized roles and invalid tenants before any database access", async () => {
  const { repo, db, errors } = fixture();
  for (const session of [
    { ...owner, role: "TECHNICIAN" }, { ...owner, role: "ACCOUNTANT" },
    { ...owner, role: "UNKNOWN" }, { ...owner, organizationId: "../victim" },
    { ...owner, organizationId: "" }, { ...owner, uid: "" },
  ]) {
    for (const run of [
      () => repo.readCustomer(session, "customer-a"),
      () => repo.listCustomers(session, { q: "", status: "ALL" }),
      () => repo.createCustomer(session, createInput),
      () => repo.updateCustomer(session, "customer-a", { ...form, version: 1 }),
    ]) await assert.rejects(run(), (error) => error instanceof errors.CustomerAccessError);
  }
  assert.equal(db.reads.length, 0);
  assert.equal(db.queries.length, 0);
  assert.equal(db.commits.length, 0);
  for (const role of ["OWNER", "ADMIN", "MANAGER", "DISPATCHER"]) {
    assert.equal((await repo.listCustomers({ ...owner, role }, { q: "", status: "ALL" })).customers.length, 0);
  }
});

test("document reads, updates and cursors reject cross-tenant records without exposing data", async () => {
  const { repo, db, errors } = fixture();
  seedCustomer(db, "victim", { organizationId: "org-b", name: "Confidential customer" });
  for (const id of ["victim", "missing", "../victim", "a/b"]) {
    await assert.rejects(repo.readCustomer(owner, id), (error) => error instanceof errors.CustomerNotFoundError);
    await assert.rejects(repo.updateCustomer(owner, id, { ...form, version: 1 }), (error) => error instanceof errors.CustomerNotFoundError);
  }
  await assert.rejects(repo.listCustomers(owner, { q: "", status: "ALL", cursor: "victim" }), (error) => error instanceof errors.CustomerCursorError);
  assert.equal(db.queries.length, 0, "reject foreign cursor before executing list query");
  assert.ok(db.reads.every((path) => !path.includes("../") && path.split("/").length === 2));
  assert.equal(db.commits.length, 0);
  assert.equal(db.values("auditLogs").length, 0);
  assert.equal(db.records.get("customers/victim").name, "Confidential customer");
});

test("list queries are tenant-scoped, bounded and paginate without duplicates across ties", async () => {
  const { repo, db } = fixture();
  for (let index = 0; index < 56; index++) {
    seedCustomer(db, `customer-${String(index).padStart(3, "0")}`, { name: index < 30 ? "Acme" : "Beta", isActive: index % 2 === 0 });
  }
  seedCustomer(db, "foreign", { organizationId: "org-b", name: "Acme" });
  const result = [];
  let cursor;
  do {
    const page = await repo.listCustomers(owner, { q: "", status: "ALL", ...(cursor ? { cursor } : {}) });
    assert.ok(page.customers.length <= 25);
    assert.ok(page.customers.every((customer) => !Object.hasOwn(customer, "organizationId")));
    result.push(...page.customers.map((customer) => customer.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(result.length, 56);
  assert.equal(new Set(result).size, 56);
  assert.ok(!result.includes("foreign"));
  for (const query of db.queries) {
    assert.ok(query.filters.some(({ field, operator, value }) => field === "organizationId" && operator === "==" && value === owner.organizationId));
    assert.equal(query.maximum, 26);
  }
  const active = await repo.listCustomers(owner, { q: "  ＡＣ  ", status: "ACTIVE" });
  assert.equal(active.customers.length, 15);
  assert.ok(active.customers.every((customer) => customer.isActive && customer.name === "Acme"));
  const inactive = await repo.listCustomers(owner, { q: "beta", status: "INACTIVE" });
  assert.equal(inactive.customers.length, 13);
  assert.ok(inactive.customers.every((customer) => !customer.isActive && customer.name === "Beta"));
  seedCustomer(db, "unicode", { name: "Acme 😀" });
  const unicode = await repo.listCustomers(owner, { q: "Acme 😀", status: "ALL" });
  assert.equal(JSON.stringify(unicode.customers.map((customer) => customer.id)), JSON.stringify(["unicode"]));
});

test("cursor must still match filters and invalid filters never reach Firestore", async () => {
  const { repo, db, errors } = fixture();
  seedCustomer(db, "active", { name: "Acme" });
  seedCustomer(db, "inactive", { name: "Beta", isActive: false });
  for (const filters of [
    { q: "", status: "ACTIVE", cursor: "inactive" },
    { q: "beta", status: "ALL", cursor: "active" },
    { q: "", status: "ALL", cursor: "missing" },
  ]) await assert.rejects(repo.listCustomers(owner, filters), (error) => error instanceof errors.CustomerCursorError);
  for (const filters of [
    { q: "x".repeat(121), status: "ALL" }, { q: "line\nbreak", status: "ALL" },
    { q: "", status: "INVALID" }, { q: "", status: "ALL", cursor: "../foreign" },
  ]) await assert.rejects(repo.listCustomers(owner, filters));
  assert.equal(db.queries.length, 0);
});

test("create atomically allocates numbers and audits, with idempotent retry semantics", async () => {
  const { repo, db, errors } = fixture();
  db.retryNextTransaction = true;
  const first = await repo.createCustomer(owner, createInput);
  assert.equal(first.customerNumber, "CUS-000001");
  assert.equal(first.version, 1);
  assert.equal(db.values("customers").length, 1);
  assert.equal(db.values("auditLogs").length, 1);
  assert.equal(db.commits[0].length, 3);
  assert.equal(db.records.get("customerCounters/org-a").lastNumber, 1);
  const repeated = await repo.createCustomer(owner, createInput);
  assert.equal(repeated.id, first.id);
  assert.equal(db.values("auditLogs").length, 1);
  assert.equal(db.records.get("customerCounters/org-a").lastNumber, 1);
  await assert.rejects(repo.createCustomer(owner, { ...createInput, name: "Different payload" }), (error) => error instanceof errors.CustomerConflictError);
  assert.equal(db.values("customers").length, 1);
  const second = await repo.createCustomer(owner, { ...createInput, requestId: "123e4567-e89b-42d3-a456-426614174001" });
  assert.equal(second.customerNumber, "CUS-000002");
  assert.notEqual(second.id, first.id);
  const otherTenant = await repo.createCustomer({ ...owner, organizationId: "org-b" }, createInput);
  assert.equal(otherTenant.customerNumber, "CUS-000001");
  assert.notEqual(otherTenant.id, first.id);
  const audit = db.values("auditLogs")[0].data;
  assert.equal(audit.organizationId, owner.organizationId);
  assert.equal(audit.actorUserId, owner.uid);
  assert.equal(audit.action, "CUSTOMER_CREATED");
  assert.equal(audit.entityId, first.id);
  assert.equal(JSON.stringify(audit.metadata), JSON.stringify({ customerNumber: first.customerNumber }));
  assert.ok(!JSON.stringify(audit).includes(form.email));
  assert.ok(!JSON.stringify(audit).includes(form.phone));
  assert.ok(!JSON.stringify(audit).includes(form.notes));
});

test("failed creates preserve customer, sequence and audit atomicity", async () => {
  const { repo, db } = fixture();
  db.failNextCommit = true;
  await assert.rejects(repo.createCustomer(owner, createInput));
  assert.equal(db.records.size, 0);
  const retried = await repo.createCustomer(owner, createInput);
  assert.equal(retried.customerNumber, "CUS-000001");
  for (const counter of [
    { organizationId: "org-b", lastNumber: 1 },
    { organizationId: "org-a", lastNumber: -1 },
    { organizationId: "org-a", lastNumber: 1.5 },
    { organizationId: "org-a", lastNumber: Number.MAX_SAFE_INTEGER },
  ]) {
    const isolated = fixture();
    isolated.db.seed("customerCounters/org-a", counter);
    await assert.rejects(isolated.repo.createCustomer(owner, createInput));
    assert.equal(isolated.db.values("customers").length, 0);
    assert.equal(isolated.db.values("auditLogs").length, 0);
    assert.equal(JSON.stringify(isolated.db.records.get("customerCounters/org-a")), JSON.stringify(counter));
  }
  const legacy = fixture();
  seedCustomer(legacy.db, "legacy");
  await assert.rejects(legacy.repo.createCustomer(owner, createInput));
  assert.equal(legacy.db.values("customers").length, 1);
  assert.equal(legacy.db.values("auditLogs").length, 0);
});

test("updates enforce optimistic versions, no-op behavior and audit metadata minimization", async () => {
  const { repo, db, errors } = fixture();
  const created = await repo.createCustomer(owner, createInput);
  const before = db.values("auditLogs").length;
  const noChange = await repo.updateCustomer(owner, created.id, { ...form, version: 1 });
  assert.equal(noChange.version, 1);
  assert.equal(db.values("auditLogs").length, before);
  const changed = await repo.updateCustomer(owner, created.id, { ...form, name: "Beta Services", notes: "Changed private note", isActive: false, version: 1 });
  assert.equal(changed.version, 2);
  assert.equal(changed.isActive, false);
  assert.equal(db.records.get(`customers/${created.id}`).nameSearch, "beta services");
  const audit = db.values("auditLogs").at(-1).data;
  assert.equal(audit.action, "CUSTOMER_UPDATED");
  assert.equal(JSON.stringify(audit.metadata), JSON.stringify({ changedFields: ["name", "notes", "isActive"], version: 2 }));
  assert.ok(!JSON.stringify(audit).includes("Changed private note"));
  assert.equal(db.commits.at(-1).length, 2);
  await assert.rejects(repo.updateCustomer(owner, created.id, { ...form, version: 1 }), (error) => error instanceof errors.CustomerConflictError);
  assert.equal(db.values("auditLogs").length, before + 1);
  db.failNextCommit = true;
  await assert.rejects(repo.updateCustomer(owner, created.id, { ...form, version: 2 }));
  assert.equal(db.records.get(`customers/${created.id}`).version, 2);
  assert.equal(db.records.get(`customers/${created.id}`).name, "Beta Services");
  assert.equal(db.values("auditLogs").length, before + 1);
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
console.log(`Customer repository checks passed: ${passed}/${tests.length}.`);
