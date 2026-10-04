import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { moduleLoader, MemoryFirestore, firestoreMock } from "./helpers/firestore-harness.mjs";

const owner = { uid: "owner-a", organizationId: "org-a", role: "OWNER", displayName: "Olive Owner" };
const manager = { ...owner, uid: "manager-a", role: "MANAGER", displayName: "Manny Manager" };
const accountant = { ...owner, uid: "acct-a", role: "ACCOUNTANT", displayName: "Ann Accountant" };
const dispatcher = { ...owner, uid: "disp-a", role: "DISPATCHER", displayName: "Dee Dispatcher" };
const tests = [];
const test = (name, run) => tests.push({ name, run });
function same(actual, expected, message) { assert.equal(JSON.stringify(actual), JSON.stringify(expected), message); }

const pipe = { name: "Copper pipe 15 mm", sku: "pipe-cu-15", description: "Per metre.", unit: "m", unitPrice: 4.5, taxRatePercent: null, trackStock: true, reorderLevel: 10, isActive: true };
const labour = { name: "Labour hour", sku: "LAB-HR", description: "", unit: "hr", unitPrice: 60, taxRatePercent: 0, trackStock: false, reorderLevel: 0, isActive: true };

function fixture() {
  const db = new MemoryFirestore();
  db.seed("organizationSettings/org-a", { organizationId: "org-a", currency: "INR", defaultTaxRatePercent: 18, timezone: "Asia/Kolkata" });
  const load = moduleLoader({
    "firebase-admin/firestore": firestoreMock,
    "@/src/lib/firebase/admin": { adminDb: db },
    console: { error() {}, warn() {}, log() {}, info() {}, debug() {} },
  });
  return { db, load, repo: load("src/features/products/repositories/product.repository.ts"), schema: load("src/features/products/schemas/product.schema.ts"), errors: load("src/features/products/repositories/product-errors.ts") };
}
const create = (f, values, session = owner) => f.repo.createProduct(session, { ...values, requestId: randomUUID() });

test("schemas normalise SKUs, allow workspace-default tax, and validate stock movements", () => {
  const { schema } = fixture();
  const parsed = schema.productFormSchema.parse(pipe);
  assert.equal(parsed.sku, "PIPE-CU-15");
  assert.equal(parsed.taxRatePercent, null);
  assert.equal(schema.productFormSchema.safeParse({ ...pipe, sku: "bad sku!" }).success, false);
  assert.equal(schema.productFormSchema.safeParse({ ...pipe, unitPrice: 4.555 }).success, false, "prices use two decimals");
  assert.equal(schema.productFormSchema.safeParse({ ...pipe, taxRatePercent: 101 }).success, false);
  assert.equal(schema.productFormSchema.safeParse({ ...pipe, quantityOnHand: 5 }).success, false, "stock is never set through the form");
  const movement = (type, quantity) => schema.stockMovementSchema.safeParse({ productId: "p1", type, quantity, reason: "", reference: "", requestId: randomUUID() }).success;
  assert.equal(movement("IN", 5), true);
  assert.equal(movement("OUT", 0), false, "issues need a quantity");
  assert.equal(movement("ADJUST", 0), true, "a count can be zero");
  assert.equal(movement("IN", 2.5), false, "stock is whole units");
  assert.equal(schema.productPickSchema.safeParse({ id: "p1", name: "Pipe", unitPrice: 4.5, taxRatePercent: null, unit: "m" }).success, true);
});

test("products are created once per request with a reserved, case-insensitive SKU", async () => {
  const f = fixture();
  const requestId = randomUUID();
  const first = await f.repo.createProduct(owner, { ...pipe, requestId });
  assert.equal(first.sku, "PIPE-CU-15");
  assert.equal(first.quantityOnHand, 0);
  assert.equal(first.lowStock, true, "an empty tracked product is below its reorder level");
  const replay = await f.repo.createProduct(owner, { ...pipe, requestId });
  assert.equal(replay.id, first.id);
  await assert.rejects(f.repo.createProduct(owner, { ...pipe, name: "Different", requestId }), f.errors.ProductConflictError, "same request, different payload");
  await assert.rejects(create(f, { ...pipe, sku: "Pipe-Cu-15" }), f.errors.ProductDuplicateSkuError);
  assert.equal(f.db.values("productSkus").length, 1);
  assert.equal(f.db.values("auditLogs").at(-1).data.action, "PRODUCT_CREATED");
  await assert.rejects(create(f, pipe, dispatcher), f.errors.ProductAccessError);
  await assert.rejects(create(f, { ...pipe, sku: "X-1" }, accountant), f.errors.ProductAccessError, "accountants read the catalog but do not manage it");
  const second = await create(f, labour, manager);
  assert.equal(second.lowStock, false, "untracked products are never low on stock");
});

test("updates move SKU reservations and respect versions", async () => {
  const f = fixture();
  const product = await create(f, pipe);
  const renamed = await f.repo.updateProduct(owner, product.id, { ...pipe, sku: "PIPE-CU-15B", reorderLevel: 0, version: 1 });
  assert.equal(renamed.sku, "PIPE-CU-15B");
  assert.equal(renamed.version, 2);
  assert.equal(renamed.lowStock, true, "zero on hand is still at the reorder level of zero");
  const reservations = f.db.values("productSkus").map((row) => row.data.sku).sort();
  same(reservations, ["PIPE-CU-15B"], "old reservation released, new one taken");
  await assert.rejects(f.repo.updateProduct(owner, product.id, { ...pipe, version: 1 }), f.errors.ProductConflictError);
  const unchanged = await f.repo.updateProduct(owner, product.id, { ...pipe, sku: "PIPE-CU-15B", reorderLevel: 0, version: 2 });
  assert.equal(unchanged.version, 2, "no-op updates do not bump the version");
  await create(f, labour);
  await assert.rejects(f.repo.updateProduct(owner, product.id, { ...pipe, sku: "lab-hr", version: 2 }), f.errors.ProductDuplicateSkuError);
  await assert.rejects(f.repo.readProduct({ ...owner, organizationId: "org-b" }, product.id), f.errors.ProductNotFoundError, "other tenants never see the product");
});

test("stock movements update quantities transactionally and keep a ledger", async () => {
  const f = fixture();
  const product = await create(f, pipe);
  const service = await create(f, labour);
  const move = (type, quantity, productId = product.id, session = owner, extra = {}) => f.repo.recordStockMovement(session, { productId, type, quantity, reason: "", reference: "", requestId: randomUUID(), ...extra });
  const received = await move("IN", 25, product.id, owner, { reference: "PO-18" });
  assert.equal(received.product.quantityOnHand, 25);
  assert.equal(received.product.lowStock, false);
  assert.equal(received.movement.quantityDelta, 25);
  assert.equal(received.movement.source, "MANUAL");
  await assert.rejects(move("OUT", 26), (error) => error instanceof f.errors.StockRuleError && error.rule === "INSUFFICIENT_STOCK");
  const issued = await move("OUT", 20);
  assert.equal(issued.product.quantityOnHand, 5);
  assert.equal(issued.product.lowStock, true, "five is at or below the reorder level of ten");
  const counted = await move("ADJUST", 12);
  assert.equal(counted.movement.quantityDelta, 7);
  assert.equal(counted.movement.quantity, 7, "adjustments record the absolute difference");
  assert.equal(counted.product.quantityOnHand, 12);
  assert.equal(counted.product.version, 4);
  await assert.rejects(move("IN", 1, service.id), (error) => error instanceof f.errors.StockRuleError && error.rule === "NOT_TRACKED");
  await assert.rejects(move("IN", 1, product.id, dispatcher), f.errors.ProductAccessError);
  const requestId = randomUUID();
  const once = await f.repo.recordStockMovement(owner, { productId: product.id, type: "IN", quantity: 3, reason: "", reference: "", requestId });
  const twice = await f.repo.recordStockMovement(owner, { productId: product.id, type: "IN", quantity: 3, reason: "", reference: "", requestId });
  assert.equal(twice.movement.id, once.movement.id);
  assert.equal(twice.product.quantityOnHand, 15, "replays do not move stock twice");
  const ledger = await f.repo.listStockMovements(owner, { type: "ALL" });
  assert.equal(ledger.movements.length, 4);
  same(ledger.movements.map((row) => row.type).sort(), ["ADJUST", "IN", "IN", "OUT"]);
  const outs = await f.repo.listStockMovements(owner, { type: "OUT", productId: product.id });
  assert.equal(outs.movements.length, 1);
  assert.equal(outs.movements[0].quantityAfter, 5);
  await f.repo.updateProduct(owner, product.id, { ...pipe, isActive: false, version: 5 });
  await assert.rejects(move("IN", 1), (error) => error instanceof f.errors.StockRuleError && error.rule === "INACTIVE");
  assert.equal(f.db.values("auditLogs").filter((row) => row.data.action === "STOCK_MOVED").length, 4);
});

test("catalog options and low-stock lists are tenant-scoped and role-aware", async () => {
  const f = fixture();
  const product = await create(f, pipe);
  await create(f, labour);
  await create(f, { ...pipe, name: "Retired valve", sku: "VALVE-OLD", isActive: false });
  f.db.seed("products/foreign", { organizationId: "org-b", name: "Foreign", nameSearch: "foreign", sku: "F-1", description: "", unit: "pc", unitPrice: 1, taxRatePercent: null, trackStock: true, reorderLevel: 0, isActive: true, quantityOnHand: 0, lowStock: true, version: 1, createdAt: firestoreMock.Timestamp.now(), updatedAt: firestoreMock.Timestamp.now() });
  const options = await f.repo.listProductOptions(accountant, { q: "" });
  same(options.options.map((option) => option.name), ["Copper pipe 15 mm", "Labour hour"], "inactive and foreign products are excluded");
  assert.equal(options.options[0].unitPrice, 4.5);
  assert.equal(options.options[0].taxRatePercent, null);
  await assert.rejects(f.repo.listProductOptions(dispatcher, { q: "" }), f.errors.ProductAccessError);
  await assert.rejects(f.repo.listProducts(accountant, {}), f.errors.ProductAccessError);
  const low = await f.repo.listLowStockProducts(owner);
  same(low.map((row) => row.id), [product.id], "only active tracked products at or below reorder level");
  const list = await f.repo.listProducts(owner, { stock: "LOW", status: "ACTIVE" });
  same(list.products.map((row) => row.id), [product.id]);
  assert.equal((await f.repo.listProducts(owner, { stock: "LOW" })).products.length, 2, "the inactive valve is still low on stock when no status filter applies");
  const inactive = await f.repo.listProducts(owner, { status: "INACTIVE" });
  same(inactive.products.map((row) => row.sku), ["VALVE-OLD"]);
  const searched = await f.repo.listProducts(owner, { q: "lab" });
  same(searched.products.map((row) => row.sku), ["LAB-HR"]);
});

let failed = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`ok - ${name}`); }
  catch (error) { failed++; console.error(`not ok - ${name}`); console.error(error); }
}
if (failed) { console.error(`Inventory checks failed: ${failed}/${tests.length}.`); process.exit(1); }
console.log(`Inventory checks passed: ${tests.length}/${tests.length}.`);
