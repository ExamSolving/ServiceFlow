import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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


export { moduleLoader, MemoryFirestore, MemoryTimestamp, firestoreMock, commitDate };
