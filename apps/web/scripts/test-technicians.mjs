import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
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

// Feature behavior checks are registered below; the runner rejects accidental
// empty suites so invoking this script always executes assertions.
const owner = { uid: "owner-a", organizationId: "org-a", role: "OWNER" };
const form = { displayName: "Alex Field", phone: "+91 98765 43210", status: "AVAILABLE" };
const requestId = "123e4567-e89b-42d3-a456-426614174000";
const createInput = { ...form, userId: "tech-user-a", requestId };
const secondRequestId = "123e4567-e89b-42d3-a456-426614174001";
function fixture(options = {}) {
  const db = new MemoryFirestore();
  const navigationError = new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  const authError = new Error("NEXT_REDIRECT;replace;/login;307;");
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
    db, load, state, navigationError, authError,
    repo: load("src/features/technicians/repositories/technician.repository.ts"),
    schema: load("src/features/technicians/schemas/technician.schema.ts"),
    errors: load("src/features/technicians/repositories/technician-errors.ts"),
  };
}
function seedMember(db, userId = createInput.userId, overrides = {}) {
  const organizationId = overrides.organizationId ?? owner.organizationId;
  const { user = {}, membership = {} } = overrides;
  db.seed(`memberships/${organizationId}_${userId}`, { organizationId, userId, status: "ACTIVE", role: "TECHNICIAN", ...membership });
  db.seed(`users/${userId}`, { displayName: form.displayName, email: `${userId}@example.com`, isActive: true, ...user });
}
function seedTechnician(db, id, overrides = {}) {
  const fields = { ...form, ...overrides };
  db.seed(`technicians/${id}`, {
    organizationId: owner.organizationId, userId: `user-${id}`, employeeNumber: "TEC-000001", version: 1,
    createdAt: MemoryTimestamp.now(), updatedAt: MemoryTimestamp.now(),
    ...fields, nameSearch: fields.displayName.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(),
  });
}

test("mutation origin guard accepts the browser host despite Next URL normalization", () => {
  const load = moduleLoader({ "next/server": { NextResponse: { json: () => ({}) } } });
  const { isTechnicianRequestSameOrigin } = load("src/features/technicians/services/technician-api.ts");
  const requestFor = ({ origin, site, host = "127.0.0.1:3005", protocol = "http" } = {}) => {
    const headers = new Headers({ host, "x-forwarded-proto": protocol });
    if (origin) headers.set("origin", origin);
    if (site) headers.set("sec-fetch-site", site);
    return { headers, nextUrl: new URL("http://localhost:3005/api/technicians") };
  };
  assert.equal(isTechnicianRequestSameOrigin(requestFor({ origin: "http://127.0.0.1:3005", site: "same-origin" })), true);
  assert.equal(isTechnicianRequestSameOrigin(requestFor({ origin: "https://serviceflow.example", host: "serviceflow.example", protocol: "https" })), true);
  assert.equal(isTechnicianRequestSameOrigin(requestFor({ origin: "https://evil.example" })), false);
  assert.equal(isTechnicianRequestSameOrigin(requestFor({ origin: "http://127.0.0.1:3005", site: "cross-site" })), false);
  assert.equal(isTechnicianRequestSameOrigin(requestFor({ site: "same-site" })), false);
});

test("strict schemas normalize inputs and reject identity or tenant mutation", () => {
  const { schema } = fixture();
  const parsed = schema.technicianCreateSchema.parse({ ...createInput, displayName: "  Alex Field  ", phone: " +91 98765 43210 " });
  assert.equal(parsed.displayName, form.displayName);
  assert.equal(parsed.phone, form.phone);
  assert.equal(schema.normalizeTechnicianName("  ＡＬＥＸ   Field  "), "alex field");
  assert.equal(schema.technicianFormSchema.safeParse({ ...form, phone: "" }).success, true);
  for (const status of ["AVAILABLE", "BUSY", "OFFLINE", "ON_LEAVE", "INACTIVE"]) {
    assert.equal(schema.technicianCreateSchema.safeParse({ ...createInput, status }).success, true);
  }
  for (const invalid of [
    { organizationId: "victim" }, { createdBy: "victim" }, { employeeNumber: "TECH-999999" },
    { version: 99 }, { requestId: "invalid" }, { userId: "../victim" },
    { displayName: "x" }, { displayName: "a\nb" }, { displayName: "x".repeat(121) },
    { displayName: "bad\0name" }, { displayName: "bad\ud800name" },
    { phone: "12" }, { phone: "abc1234567" }, { phone: "1234567890123456" },
    { status: "UNKNOWN" },
  ]) assert.equal(schema.technicianCreateSchema.safeParse({ ...createInput, ...invalid }).success, false, JSON.stringify(invalid));
  for (const version of [0, -1, 1.1, Number.MAX_SAFE_INTEGER, "1"]) {
    assert.equal(schema.technicianUpdateSchema.safeParse({ ...form, version }).success, false);
  }
  for (const mutation of [{ userId: "other-user" }, { organizationId: "victim" }, { employeeNumber: "TECH-999999" }]) {
    assert.equal(schema.technicianUpdateSchema.safeParse({ ...form, version: 1, ...mutation }).success, false);
  }
  for (const id of ["", "../tech", "a/b", "..", "has space", "x".repeat(129)]) {
    assert.equal(schema.technicianIdSchema.safeParse(id).success, false, id);
  }
});

test("repository grants only owner/admin/manager and rejects invalid sessions before I/O", async () => {
  const { repo, db, errors } = fixture();
  for (const session of [
    ...["DISPATCHER", "TECHNICIAN", "ACCOUNTANT", "UNKNOWN"].map((role) => ({ ...owner, role })),
    { ...owner, organizationId: "../victim" }, { ...owner, organizationId: "" },
    { ...owner, uid: "" },
  ]) {
    for (const run of [
      () => repo.readTechnician(session, "technician-a"),
      () => repo.listTechnicians(session, { q: "", status: "ALL" }),
      () => repo.listTechnicianMembers(session),
      () => repo.createTechnician(session, createInput),
      () => repo.updateTechnician(session, "technician-a", { ...form, version: 1 }),
    ]) await assert.rejects(run(), (error) => error instanceof errors.TechnicianAccessError);
  }
  assert.equal(db.reads.length, 0);
  assert.equal(db.queries.length, 0);
  assert.equal(db.commits.length, 0);
  for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
    assert.equal((await repo.listTechnicians({ ...owner, role }, { q: "", status: "ALL" })).technicians.length, 0);
    assert.equal((await repo.listTechnicianMembers({ ...owner, role })).members.length, 0);
  }
});

test("record reads/updates/cursors reject foreign and invalid document IDs", async () => {
  const { repo, db, errors } = fixture();
  seedTechnician(db, "victim", { organizationId: "org-b", displayName: "Confidential person" });
  for (const id of ["victim", "missing", "../victim", "a/b"]) {
    await assert.rejects(repo.readTechnician(owner, id), (error) => error instanceof errors.TechnicianNotFoundError);
    await assert.rejects(repo.updateTechnician(owner, id, { ...form, version: 1 }), (error) => error instanceof errors.TechnicianNotFoundError);
  }
  await assert.rejects(repo.listTechnicians(owner, { q: "", status: "ALL", cursor: "victim" }), (error) => error instanceof errors.TechnicianCursorError);
  assert.equal(db.queries.length, 0);
  assert.ok(db.reads.every((path) => !path.includes("../") && path.split("/").length === 2));
  assert.equal(db.commits.length, 0);
  assert.equal(db.records.get("technicians/victim").displayName, "Confidential person");
});

test("technician pagination is tenant-scoped, bounded and deterministic across name ties", async () => {
  const { repo, db } = fixture();
  for (let index = 0; index < 56; index++) {
    seedTechnician(db, `technician-${String(index).padStart(3, "0")}`, { displayName: index < 30 ? "Alex" : "Blair", status: index % 2 === 0 ? "AVAILABLE" : "ON_LEAVE" });
  }
  seedTechnician(db, "foreign", { organizationId: "org-b", displayName: "Alex" });
  const ids = [];
  let cursor;
  do {
    const page = await repo.listTechnicians(owner, { q: "", status: "ALL", ...(cursor ? { cursor } : {}) });
    assert.ok(page.technicians.length <= 25);
    assert.ok(page.technicians.every((technician) => !Object.hasOwn(technician, "organizationId")));
    ids.push(...page.technicians.map((technician) => technician.id));
    cursor = page.nextCursor;
    assert.ok(ids.length <= 56, "pagination must make forward progress");
  } while (cursor);
  assert.equal(ids.length, 56);
  assert.equal(new Set(ids).size, 56);
  assert.ok(!ids.includes("foreign"));
  for (const query of db.queries) {
    assert.ok(query.filters.some(({ field, operator, value }) => field === "organizationId" && operator === "==" && value === owner.organizationId));
    assert.equal(query.maximum, 26);
  }
  const available = await repo.listTechnicians(owner, { q: "  ＡＬ  ", status: "AVAILABLE" });
  assert.equal(available.technicians.length, 15);
  assert.ok(available.technicians.every((technician) => technician.status === "AVAILABLE" && technician.displayName === "Alex"));
  const onLeave = await repo.listTechnicians(owner, { q: "blair", status: "ON_LEAVE" });
  assert.equal(onLeave.technicians.length, 13);
  seedTechnician(db, "unicode", { displayName: "Alex 😀" });
  const unicode = await repo.listTechnicians(owner, { q: "Alex 😀", status: "ALL" });
  assert.equal(JSON.stringify(unicode.technicians.map((technician) => technician.id)), JSON.stringify(["unicode"]));
});

test("stale or mismatched cursors and malformed filters never run a list query", async () => {
  const { repo, db, errors } = fixture();
  seedTechnician(db, "available", { displayName: "Alex" });
  seedTechnician(db, "inactive", { displayName: "Blair", status: "INACTIVE" });
  for (const filters of [
    { q: "", status: "AVAILABLE", cursor: "inactive" },
    { q: "blair", status: "ALL", cursor: "available" },
    { q: "", status: "ALL", cursor: "missing" },
  ]) await assert.rejects(repo.listTechnicians(owner, filters), (error) => error instanceof errors.TechnicianCursorError);
  for (const filters of [
    { q: "x".repeat(121), status: "ALL" }, { q: "line\nbreak", status: "ALL" },
    { q: "", status: "INVALID" }, { q: "", status: "ALL", cursor: "../foreign" },
    { q: "", status: "ALL", organizationId: "victim" },
  ]) await assert.rejects(repo.listTechnicians(owner, filters));
  assert.equal(db.queries.length, 0);
});

test("member picker is tenant-scoped, paginated and excludes ineligible users", async () => {
  const { repo, db } = fixture();
  for (let index = 0; index < 56; index++) seedMember(db, `member-${String(index).padStart(3, "0")}`);
  seedMember(db, "foreign", { organizationId: "org-b" });
  seedMember(db, "inactive-user", { user: { isActive: false } });
  seedMember(db, "wrong-role", { membership: { role: "ADMIN" } });
  seedMember(db, "inactive-member", { membership: { status: "SUSPENDED" } });
  seedMember(db, "missing-user");
  db.records.delete("users/missing-user");
  seedTechnician(db, "existing", { userId: "member-000" });
  const members = [];
  let memberCursor;
  do {
    const page = await repo.listTechnicianMembers(owner, memberCursor ? { memberCursor } : {});
    assert.ok(page.members.length <= 25);
    members.push(...page.members);
    memberCursor = page.nextMemberCursor;
    assert.ok(members.length <= 56);
  } while (memberCursor);
  assert.equal(members.length, 56);
  assert.equal(new Set(members.map((member) => member.userId)).size, 56);
  assert.equal(members.find((member) => member.userId === "member-000").linked, true);
  assert.ok(members.filter((member) => member.userId !== "member-000").every((member) => !member.linked));
  for (const query of db.queries) {
    assert.ok(query.filters.some(({ field, operator, value }) => field === "organizationId" && operator === "==" && value === owner.organizationId));
    if (query.path === "memberships") {
      assert.equal(query.maximum, 26);
      assert.ok(query.filters.some(({ field, value }) => field === "role" && value === "TECHNICIAN"));
      assert.ok(query.filters.some(({ field, value }) => field === "status" && value === "ACTIVE"));
    } else assert.equal(query.maximum, 2);
  }
  assert.ok(!db.reads.includes("users/foreign"));
  assert.ok(!db.reads.includes("users/wrong-role"));
  assert.ok(!db.reads.includes("users/inactive-member"));
});

test("member ownership and canonical membership ID are proven before global user reads", async () => {
  for (const badMember of [
    { path: "memberships/org-b_private", data: { organizationId: "org-b", userId: "private", role: "TECHNICIAN", status: "ACTIVE" } },
    { path: "memberships/wrong-id", data: { organizationId: "org-a", userId: "private", role: "TECHNICIAN", status: "ACTIVE" } },
    { path: "memberships/org-a_private", data: { organizationId: "org-a", userId: "private", role: "ADMIN", status: "ACTIVE" } },
    { path: "memberships/org-a_private", data: { organizationId: "org-a", userId: "private", role: "TECHNICIAN", status: "SUSPENDED" } },
  ]) {
    const { repo, db } = fixture();
    db.seed(badMember.path, badMember.data);
    db.seed("users/private", { isActive: true, displayName: "Secret user", email: "private@example.com" });
    db.queryResultOverrides.set("memberships", [badMember.path]);
    const result = await repo.listTechnicianMembers(owner);
    assert.equal(result.members.length, 0);
    assert.ok(!db.reads.includes("users/private"), badMember.path);
  }
  const { repo, db, errors } = fixture();
  seedMember(db, "private", { organizationId: "org-b" });
  seedMember(db, "suspended", { membership: { status: "SUSPENDED" } });
  for (const memberCursor of ["org-b_private", "org-a_suspended", "missing"]) {
    await assert.rejects(repo.listTechnicianMembers(owner, { memberCursor }), (error) => error instanceof errors.TechnicianCursorError);
  }
  assert.equal(db.queries.length, 0);
  assert.ok(!db.reads.some((path) => path.startsWith("users/")));
});

test("create requires an active tenant technician membership and an active existing user", async () => {
  for (const overrides of [
    { membership: { organizationId: "org-b" } }, { membership: { userId: "other-user" } },
    { membership: { role: "ADMIN" } }, { membership: { role: "DISPATCHER" } },
    { membership: { status: "SUSPENDED" } }, { user: { isActive: false } },
  ]) {
    const { repo, db, errors } = fixture();
    seedMember(db, createInput.userId, overrides);
    await assert.rejects(repo.createTechnician(owner, createInput), (error) => error instanceof errors.TechnicianIneligibleMemberError);
    await assert.rejects(repo.createTechnician(owner, { ...createInput, status: "INACTIVE" }), (error) => error instanceof errors.TechnicianIneligibleMemberError);
    assert.equal(db.values("technicians").length, 0);
    assert.equal(db.values("auditLogs").length, 0);
    assert.equal(db.commits.length, 0);
    if (overrides.membership) assert.ok(!db.reads.includes(`users/${createInput.userId}`));
  }
  for (const missing of ["memberships/org-a_tech-user-a", "users/tech-user-a"]) {
    const { repo, db, errors } = fixture();
    seedMember(db);
    db.records.delete(missing);
    await assert.rejects(repo.createTechnician(owner, createInput), (error) => error instanceof errors.TechnicianIneligibleMemberError);
    assert.equal(db.commits.length, 0);
  }
});

test("membership and active user are revalidated inside retried create transactions", async () => {
  for (const revoke of [
    (db) => db.seed("memberships/org-a_tech-user-a", { organizationId: "org-a", userId: createInput.userId, role: "TECHNICIAN", status: "SUSPENDED" }),
    (db) => db.seed("users/tech-user-a", { displayName: form.displayName, email: "tech@example.com", isActive: false }),
  ]) {
    const { repo, db, errors } = fixture();
    seedMember(db);
    const eligible = await repo.listTechnicianMembers(owner);
    assert.equal(eligible.members.length, 1);
    db.beforeNextCommit = revoke;
    await assert.rejects(repo.createTechnician(owner, createInput), (error) => error instanceof errors.TechnicianIneligibleMemberError);
    assert.equal(db.values("technicians").length, 0);
    assert.equal(db.values("auditLogs").length, 0);
    assert.equal(db.values("technicianCreateRequests").length, 0);
    assert.equal(db.values("technicianCounters").length, 0);
  }
});

test("create atomically allocates a number and audit with idempotent request retries", async () => {
  const { repo, db, errors } = fixture();
  seedMember(db);
  db.retryNextTransaction = true;
  const first = await repo.createTechnician(owner, createInput);
  assert.equal(first.employeeNumber, "TEC-000001");
  assert.equal(first.userId, createInput.userId);
  assert.equal(first.version, 1);
  assert.equal(db.values("technicians").length, 1);
  assert.equal(db.values("auditLogs").length, 1);
  assert.equal(db.values("technicianCreateRequests").length, 1);
  assert.equal(db.commits[0].length, 4);
  assert.equal(db.records.get("technicianCounters/org-a").lastNumber, 1);
  const repeated = await repo.createTechnician(owner, createInput);
  assert.equal(repeated.id, first.id);
  assert.equal(db.values("auditLogs").length, 1);
  assert.equal(db.records.get("technicianCounters/org-a").lastNumber, 1);
  await assert.rejects(repo.createTechnician(owner, { ...createInput, displayName: "Changed name" }), (error) => error instanceof errors.TechnicianConflictError);
  seedMember(db, "tech-user-b");
  await assert.rejects(repo.createTechnician(owner, { ...createInput, userId: "tech-user-b" }), (error) => error instanceof errors.TechnicianConflictError);
  const second = await repo.createTechnician(owner, { ...createInput, userId: "tech-user-b", requestId: secondRequestId });
  assert.equal(second.employeeNumber, "TEC-000002");
  seedMember(db, createInput.userId, { organizationId: "org-b" });
  const otherTenant = await repo.createTechnician({ ...owner, organizationId: "org-b" }, createInput);
  assert.equal(otherTenant.employeeNumber, "TEC-000001");
  assert.notEqual(otherTenant.id, first.id);
  const audit = db.values("auditLogs")[0].data;
  assert.equal(audit.organizationId, owner.organizationId);
  assert.equal(audit.actorUserId, owner.uid);
  assert.equal(audit.action, "TECHNICIAN_CREATED");
  assert.equal(audit.entityType, "TECHNICIAN");
  assert.equal(audit.entityId, first.id);
  assert.ok(!JSON.stringify(audit).includes(form.displayName));
  assert.ok(!JSON.stringify(audit).includes(form.phone));
  assert.ok(!JSON.stringify(audit).includes("@example.com"));
});

test("concurrent creates and alternate request IDs cannot duplicate or relink profiles", async () => {
  const { repo, db, errors } = fixture();
  seedMember(db);
  const outcomes = await Promise.allSettled([
    repo.createTechnician(owner, createInput),
    repo.createTechnician(owner, { ...createInput, requestId: secondRequestId }),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.ok(outcomes.find((outcome) => outcome.status === "rejected").reason instanceof errors.TechnicianAlreadyLinkedError);
  assert.equal(db.values("technicians").length, 1);
  assert.equal(db.values("auditLogs").length, 1);
  assert.equal(db.values("technicianCreateRequests").length, 1);
  assert.equal(db.records.get("technicianCounters/org-a").lastNumber, 1);
  const profile = outcomes.find((outcome) => outcome.status === "fulfilled").value;
  await repo.updateTechnician(owner, profile.id, { ...form, status: "INACTIVE", version: 1 });
  await assert.rejects(repo.createTechnician({ ...owner, uid: "another-admin", role: "ADMIN" }, createInput), (error) => error instanceof errors.TechnicianAlreadyLinkedError);
  const legacy = fixture();
  seedMember(legacy.db);
  seedTechnician(legacy.db, "legacy-id", { userId: createInput.userId });
  await assert.rejects(legacy.repo.createTechnician(owner, createInput), (error) => error instanceof legacy.errors.TechnicianAlreadyLinkedError);
  assert.equal(legacy.db.values("technicians").length, 1);
  assert.equal(legacy.db.values("auditLogs").length, 0);
  const retry = fixture();
  seedMember(retry.db);
  const repeated = await Promise.all([retry.repo.createTechnician(owner, createInput), retry.repo.createTechnician(owner, createInput)]);
  assert.equal(repeated[0].id, repeated[1].id);
  assert.equal(retry.db.values("auditLogs").length, 1);
});

test("completed create requests replay after membership revocation without a duplicate write", async () => {
  const { repo, db, errors } = fixture();
  seedMember(db);
  const created = await repo.createTechnician(owner, createInput);
  db.seed("memberships/org-a_tech-user-a", { organizationId: "org-a", userId: createInput.userId, role: "TECHNICIAN", status: "SUSPENDED" });
  const repeated = await repo.createTechnician(owner, createInput);
  assert.equal(repeated.id, created.id);
  assert.equal(db.values("technicians").length, 1);
  assert.equal(db.values("auditLogs").length, 1);
  await assert.rejects(repo.createTechnician(owner, { ...createInput, requestId: secondRequestId }), (error) => error instanceof errors.TechnicianAlreadyLinkedError);
});

test("failed creates and invalid counters preserve number/profile/receipt/audit atomicity", async () => {
  const { repo, db } = fixture();
  seedMember(db);
  db.failNextCommit = true;
  await assert.rejects(repo.createTechnician(owner, createInput));
  for (const collection of ["technicians", "technicianCreateRequests", "technicianCounters", "auditLogs"]) assert.equal(db.values(collection).length, 0);
  const retried = await repo.createTechnician(owner, createInput);
  assert.equal(retried.employeeNumber, "TEC-000001");
  for (const counter of [
    { organizationId: "org-b", lastNumber: 1 }, { organizationId: "org-a", lastNumber: -1 },
    { organizationId: "org-a", lastNumber: 1.5 }, { organizationId: "org-a", lastNumber: Number.MAX_SAFE_INTEGER },
  ]) {
    const isolated = fixture();
    seedMember(isolated.db);
    isolated.db.seed("technicianCounters/org-a", counter);
    await assert.rejects(isolated.repo.createTechnician(owner, createInput));
    assert.equal(isolated.db.values("technicians").length, 0);
    assert.equal(isolated.db.values("auditLogs").length, 0);
    assert.equal(JSON.stringify(isolated.db.records.get("technicianCounters/org-a")), JSON.stringify(counter));
  }
  for (const hasStaleCounter of [false, true]) {
    const legacy = fixture();
    seedMember(legacy.db);
    seedTechnician(legacy.db, "legacy", { userId: "someone-else" });
    if (hasStaleCounter) legacy.db.seed("technicianCounters/org-a", { organizationId: "org-a", lastNumber: 0 });
    await assert.rejects(legacy.repo.createTechnician(owner, createInput));
    assert.equal(legacy.db.values("technicians").length, 1);
    assert.equal(legacy.db.values("auditLogs").length, 0);
    assert.equal(legacy.db.values("technicianCreateRequests").length, 0);
  }
});

test("updates enforce optimistic versions, no-op behavior, immutable identity and minimal audits", async () => {
  const { repo, db, errors } = fixture();
  seedMember(db);
  const created = await repo.createTechnician(owner, createInput);
  const noChange = await repo.updateTechnician(owner, created.id, { ...form, version: 1 });
  assert.equal(noChange.version, 1);
  assert.equal(db.values("auditLogs").length, 1);
  const changed = await repo.updateTechnician(owner, created.id, { ...form, displayName: "Blair Private", phone: "1234567890", status: "ON_LEAVE", version: 1 });
  assert.equal(changed.version, 2);
  assert.equal(changed.status, "ON_LEAVE");
  assert.equal(changed.userId, createInput.userId);
  assert.equal(db.records.get(`technicians/${created.id}`).nameSearch, "blair private");
  const audit = db.values("auditLogs").at(-1).data;
  assert.equal(audit.action, "TECHNICIAN_UPDATED");
  assert.equal(JSON.stringify(audit.metadata), JSON.stringify({ changedFields: ["displayName", "phone", "status"], version: 2 }));
  assert.ok(!JSON.stringify(audit).includes("Blair Private"));
  assert.ok(!JSON.stringify(audit).includes("1234567890"));
  assert.equal(db.commits.at(-1).length, 2);
  await assert.rejects(repo.updateTechnician(owner, created.id, { ...form, version: 1 }), (error) => error instanceof errors.TechnicianConflictError);
  for (const forbidden of [{ userId: "another-user" }, { organizationId: "org-b" }]) {
    await assert.rejects(repo.updateTechnician(owner, created.id, { ...form, version: 2, ...forbidden }));
  }
  assert.equal(db.values("auditLogs").length, 2);
  db.failNextCommit = true;
  await assert.rejects(repo.updateTechnician(owner, created.id, { ...form, version: 2 }));
  assert.equal(db.records.get(`technicians/${created.id}`).version, 2);
  assert.equal(db.records.get(`technicians/${created.id}`).displayName, "Blair Private");
  assert.equal(db.values("auditLogs").length, 2);
});

test("revoked members can be deactivated but cannot be reactivated or receive active updates", async () => {
  for (const revoke of [
    (db) => db.seed("memberships/org-a_tech-user-a", { organizationId: "org-a", userId: createInput.userId, role: "TECHNICIAN", status: "SUSPENDED" }),
    (db) => db.seed("users/tech-user-a", { displayName: form.displayName, email: "tech@example.com", isActive: false }),
  ]) {
    const { repo, db, errors } = fixture();
    seedMember(db);
    const created = await repo.createTechnician(owner, createInput);
    db.beforeNextCommit = revoke;
    await assert.rejects(repo.updateTechnician(owner, created.id, { ...form, status: "BUSY", version: 1 }), (error) => error instanceof errors.TechnicianIneligibleMemberError);
    assert.equal(db.records.get(`technicians/${created.id}`).status, "AVAILABLE");
    assert.equal(db.values("auditLogs").length, 1);
    const inactive = await repo.updateTechnician(owner, created.id, { ...form, status: "INACTIVE", version: 1 });
    assert.equal(inactive.status, "INACTIVE");
    assert.equal(inactive.version, 2);
    await assert.rejects(repo.updateTechnician(owner, created.id, { ...form, version: 2 }), (error) => error instanceof errors.TechnicianIneligibleMemberError);
    assert.equal(db.records.get(`technicians/${created.id}`).status, "INACTIVE");
    assert.equal(db.values("auditLogs").length, 2);
  }
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
console.log(`Technician repository checks passed: ${passed}/${tests.length}.`);
