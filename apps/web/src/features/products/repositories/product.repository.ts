import "server-only";

import { createHash } from "node:crypto";
import { FieldPath, Timestamp, type DocumentSnapshot, type Query, type Transaction } from "firebase-admin/firestore";
import { z } from "zod";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { hasPermission } from "@/src/lib/auth/permissions";
import { adminDb } from "@/src/lib/firebase/admin";
import {
  MAX_STOCK_QUANTITY, normalizeProductName, normalizeSku, productCreateSchema, productFormSchema, productIdSchema, productListFiltersSchema,
  productOptionsSchema, productUpdateSchema, stockMovementListFiltersSchema, stockMovementSchema, stockMovementTypes,
  type ProductCreateInput, type ProductListFiltersInput, type ProductOptionsInput, type ProductUpdateInput, type StockMovementInput, type StockMovementListFiltersInput,
} from "../schemas/product.schema";
import type { ProductDetail, ProductListData, ProductOption, ProductOptions, StockMovement, StockMovementListFilters } from "../types/product";
import { ProductAccessError, ProductConflictError, ProductCursorError, ProductDuplicateSkuError, ProductNotFoundError, StockRuleError } from "./product-errors";

export const PRODUCT_PAGE_SIZE = 25;
export const PRODUCT_OPTION_PAGE_SIZE = 10;
export const STOCK_PAGE_SIZE = 50;
const editableFields = ["name", "sku", "description", "unit", "unitPrice", "taxRatePercent", "trackStock", "reorderLevel", "isActive"] as const;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const skuRef = (organizationId: string, sku: string) => adminDb.collection("productSkus").doc(hash([organizationId, sku]));
const recordSchema = productFormSchema.extend({
  organizationId: productIdSchema,
  nameSearch: z.string().min(1),
  quantityOnHand: z.number().int().min(0).max(MAX_STOCK_QUANTITY),
  lowStock: z.boolean(),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).passthrough();
const movementSchema = z.object({
  organizationId: productIdSchema,
  productId: productIdSchema,
  productName: z.string().min(1),
  sku: z.string().min(1),
  type: z.enum(stockMovementTypes),
  source: z.enum(["MANUAL", "INVOICE_ISSUED", "INVOICE_VOIDED"]),
  quantity: z.number().int().min(0),
  quantityDelta: z.number().int(),
  quantityAfter: z.number().int().min(0),
  reason: z.string().catch(""),
  reference: z.string().catch(""),
  invoiceId: z.string().nullable().catch(null),
  createdByName: z.string().catch(""),
}).passthrough();

/** Inventory management: products, SKUs and manual stock movements. */
function assertSession(session: AppSession) {
  if (!productIdSchema.safeParse(session.organizationId).success || !productIdSchema.safeParse(session.uid).success || !hasPermission(session.role, "manageInventory")) throw new ProductAccessError();
}
/** Catalog reads for billing documents: quotation and invoice editors pick products too. */
function assertCatalogSession(session: AppSession) {
  if (!productIdSchema.safeParse(session.organizationId).success || !productIdSchema.safeParse(session.uid).success) throw new ProductAccessError();
  if (!hasPermission(session.role, "manageInventory") && !hasPermission(session.role, "manageQuotations") && !hasPermission(session.role, "manageInvoices")) throw new ProductAccessError();
}
function iso(value: unknown) {
  if (!(value instanceof Timestamp)) throw new Error("Invalid product timestamp");
  return value.toDate().toISOString();
}
const isLow = (trackStock: boolean, quantityOnHand: number, reorderLevel: number) => trackStock && quantityOnHand <= reorderLevel;

function toProduct(snapshot: DocumentSnapshot, session: AppSession): ProductDetail {
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId) throw new ProductNotFoundError();
  const record = recordSchema.parse({ ...data, quantityOnHand: data.quantityOnHand ?? 0, lowStock: data.lowStock ?? false });
  if (!productIdSchema.safeParse(snapshot.id).success || record.nameSearch !== normalizeProductName(record.name)) throw new Error("Invalid product search index or identifier");
  return {
    id: snapshot.id, name: record.name, sku: record.sku, description: record.description, unit: record.unit, unitPrice: record.unitPrice, taxRatePercent: record.taxRatePercent,
    trackStock: record.trackStock, reorderLevel: record.reorderLevel, isActive: record.isActive, quantityOnHand: record.quantityOnHand, lowStock: record.lowStock,
    version: record.version, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt),
  };
}
function toMovement(snapshot: DocumentSnapshot, session: AppSession): StockMovement {
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId) throw new ProductNotFoundError();
  const record = movementSchema.parse(data);
  return {
    id: snapshot.id, productId: record.productId, productName: record.productName, sku: record.sku, type: record.type, source: record.source, quantity: record.quantity,
    quantityDelta: record.quantityDelta, quantityAfter: record.quantityAfter, reason: record.reason, reference: record.reference, invoiceId: record.invoiceId,
    createdByName: record.createdByName, createdAt: iso(data.createdAt),
  };
}
function assertReservation(snapshot: DocumentSnapshot, organizationId: string, sku: string, productId?: string) {
  if (!snapshot.exists) return;
  const data = snapshot.data()!;
  if (data.organizationId !== organizationId || data.sku !== sku || !productIdSchema.safeParse(data.productId).success) throw new Error("Invalid product SKU reservation");
  if (productId && data.productId !== productId) throw new Error("Product SKU reservation ownership mismatch");
}
function prefixUpperBound(prefix: string): string | undefined {
  const points = Array.from(prefix);
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i].codePointAt(0)!;
    if (point < 0x10ffff) return points.slice(0, i).join("") + String.fromCodePoint(point === 0xd7ff ? 0xe000 : point + 1);
  }
}
function audit(transaction: Transaction, session: AppSession, entityType: "PRODUCT" | "STOCK_MOVEMENT", id: string, action: string, metadata: Record<string, unknown>, now: Timestamp) {
  transaction.create(adminDb.collection("auditLogs").doc(), { organizationId: session.organizationId, actorUserId: session.uid, entityType, entityId: id, action, metadata, createdAt: now });
}

export async function listProducts(session: AppSession, input: ProductListFiltersInput): Promise<ProductListData> {
  assertSession(session);
  const filters = productListFiltersSchema.parse(input);
  const prefix = normalizeProductName(filters.q);
  let query: Query = adminDb.collection("products").where("organizationId", "==", session.organizationId);
  if (filters.status !== "ALL") query = query.where("isActive", "==", filters.status === "ACTIVE");
  if (filters.stock === "TRACKED") query = query.where("trackStock", "==", true);
  if (filters.stock === "LOW") query = query.where("lowStock", "==", true);
  if (prefix) {
    query = query.where("nameSearch", ">=", prefix);
    const upper = prefixUpperBound(prefix);
    if (upper) query = query.where("nameSearch", "<", upper);
  }
  query = query.orderBy("nameSearch", "asc").orderBy(FieldPath.documentId(), "asc");
  if (filters.cursor) {
    const snapshot = await adminDb.collection("products").doc(filters.cursor).get();
    let cursor: ProductDetail;
    try { cursor = toProduct(snapshot, session); } catch (error) {
      if (error instanceof ProductNotFoundError) throw new ProductCursorError();
      throw error;
    }
    if ((filters.status !== "ALL" && cursor.isActive !== (filters.status === "ACTIVE")) || (filters.stock === "TRACKED" && !cursor.trackStock) || (filters.stock === "LOW" && !cursor.lowStock) || !normalizeProductName(cursor.name).startsWith(prefix)) throw new ProductCursorError();
    query = query.startAfter(snapshot);
  }
  const snapshot = await query.limit(PRODUCT_PAGE_SIZE + 1).get();
  const products = snapshot.docs.slice(0, PRODUCT_PAGE_SIZE).map((doc) => toProduct(doc, session));
  return { products, filters, nextCursor: snapshot.docs.length > PRODUCT_PAGE_SIZE ? products[products.length - 1].id : null };
}

export async function readProduct(session: AppSession, productId: string): Promise<ProductDetail> {
  assertSession(session);
  if (!productIdSchema.safeParse(productId).success) throw new ProductNotFoundError();
  return toProduct(await adminDb.collection("products").doc(productId).get(), session);
}

export async function createProduct(session: AppSession, input: ProductCreateInput): Promise<ProductDetail> {
  assertSession(session);
  const { requestId, ...values } = productCreateSchema.parse(input);
  const key = hash([session.organizationId, session.uid, requestId]);
  const payloadHash = hash(values);
  const reference = adminDb.collection("products").doc(`prd_${key}`);
  const nameSearch = normalizeProductName(values.name);
  const reservationRef = skuRef(session.organizationId, values.sku);
  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    if (existing.exists) {
      const record = toProduct(existing, session);
      const data = existing.data()!;
      if (data.createdBy !== session.uid || data.creationKey !== key || data.creationPayloadHash !== payloadHash) throw new ProductConflictError();
      return record;
    }
    const reservation = await transaction.get(reservationRef);
    assertReservation(reservation, session.organizationId, values.sku);
    if (reservation.exists) throw new ProductDuplicateSkuError();
    const duplicates = await transaction.get(adminDb.collection("products").where("organizationId", "==", session.organizationId).where("sku", "==", values.sku).limit(1));
    if (!duplicates.empty) throw new ProductDuplicateSkuError();
    const now = Timestamp.now();
    const lowStock = isLow(values.trackStock, 0, values.reorderLevel);
    transaction.create(reference, { ...values, organizationId: session.organizationId, nameSearch, quantityOnHand: 0, lowStock, version: 1, createdAt: now, updatedAt: now, createdBy: session.uid, creationKey: key, creationPayloadHash: payloadHash });
    transaction.create(reservationRef, { organizationId: session.organizationId, sku: values.sku, productId: reference.id, createdAt: now });
    audit(transaction, session, "PRODUCT", reference.id, "PRODUCT_CREATED", { sku: values.sku, version: 1 }, now);
    return { ...values, id: reference.id, quantityOnHand: 0, lowStock, version: 1, createdAt: now.toDate().toISOString(), updatedAt: now.toDate().toISOString() };
  });
}

export async function updateProduct(session: AppSession, productId: string, input: ProductUpdateInput): Promise<ProductDetail> {
  assertSession(session);
  if (!productIdSchema.safeParse(productId).success) throw new ProductNotFoundError();
  const { version, ...values } = productUpdateSchema.parse(input);
  const reference = adminDb.collection("products").doc(productId);
  return adminDb.runTransaction(async (transaction) => {
    const current = toProduct(await transaction.get(reference), session);
    if (current.version !== version) throw new ProductConflictError();
    const changedFields = editableFields.filter((field) => current[field] !== values[field]);
    if (!changedFields.length) return current;
    const oldSku = normalizeSku(current.sku);
    const oldRef = skuRef(session.organizationId, oldSku);
    const newRef = skuRef(session.organizationId, values.sku);
    let removeOldReservation = false;
    if (oldSku !== values.sku) {
      const oldReservation = await transaction.get(oldRef);
      assertReservation(oldReservation, session.organizationId, oldSku, productId);
      removeOldReservation = oldReservation.exists;
      const newReservation = await transaction.get(newRef);
      assertReservation(newReservation, session.organizationId, values.sku);
      if (newReservation.exists) throw new ProductDuplicateSkuError();
      const duplicates = await transaction.get(adminDb.collection("products").where("organizationId", "==", session.organizationId).where("sku", "==", values.sku).limit(1));
      if (!duplicates.empty) throw new ProductDuplicateSkuError();
    }
    const now = Timestamp.now();
    const nextVersion = version + 1;
    const lowStock = isLow(values.trackStock, current.quantityOnHand, values.reorderLevel);
    if (oldSku !== values.sku) {
      transaction.create(newRef, { organizationId: session.organizationId, sku: values.sku, productId, createdAt: now });
      if (removeOldReservation) transaction.delete(oldRef);
    }
    transaction.update(reference, { ...values, nameSearch: normalizeProductName(values.name), lowStock, version: nextVersion, updatedAt: now });
    audit(transaction, session, "PRODUCT", productId, "PRODUCT_UPDATED", { changedFields, version: nextVersion }, now);
    return { ...current, ...values, lowStock, version: nextVersion, updatedAt: now.toDate().toISOString() };
  });
}

/** Manual stock receipt, issue, or count correction. */
export async function recordStockMovement(session: AppSession, input: StockMovementInput): Promise<{ movement: StockMovement; product: ProductDetail }> {
  assertSession(session);
  const { requestId, ...values } = stockMovementSchema.parse(input);
  const key = hash([session.organizationId, session.uid, requestId]);
  const payloadHash = hash(values);
  const movementRef = adminDb.collection("stockMovements").doc(`mv_${key}`);
  const productRef = adminDb.collection("products").doc(values.productId);
  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(movementRef);
    const productSnapshot = await transaction.get(productRef);
    const product = toProduct(productSnapshot, session);
    if (existing.exists) {
      const data = existing.data()!;
      if (data.createdBy !== session.uid || data.creationKey !== key || data.creationPayloadHash !== payloadHash) throw new ProductConflictError();
      return { movement: toMovement(existing, session), product };
    }
    if (!product.isActive) throw new StockRuleError("INACTIVE", product.name);
    if (!product.trackStock) throw new StockRuleError("NOT_TRACKED", product.name);
    const quantityAfter = values.type === "IN" ? product.quantityOnHand + values.quantity : values.type === "OUT" ? product.quantityOnHand - values.quantity : values.quantity;
    if (quantityAfter < 0) throw new StockRuleError("INSUFFICIENT_STOCK", product.name);
    if (quantityAfter > MAX_STOCK_QUANTITY) throw new StockRuleError("LIMIT", product.name);
    const quantityDelta = quantityAfter - product.quantityOnHand;
    const now = Timestamp.now();
    const lowStock = isLow(product.trackStock, quantityAfter, product.reorderLevel);
    const movement = {
      organizationId: session.organizationId, productId: product.id, productName: product.name, sku: product.sku, type: values.type, source: "MANUAL" as const,
      quantity: values.type === "ADJUST" ? Math.abs(quantityDelta) : values.quantity, quantityDelta, quantityAfter, reason: values.reason, reference: values.reference, invoiceId: null,
      createdBy: session.uid, createdByName: session.displayName, createdAt: now, creationKey: key, creationPayloadHash: payloadHash,
    };
    transaction.create(movementRef, movement);
    transaction.update(productRef, { quantityOnHand: quantityAfter, lowStock, version: product.version + 1, updatedAt: now });
    audit(transaction, session, "STOCK_MOVEMENT", movementRef.id, "STOCK_MOVED", { productId: product.id, type: values.type, quantityDelta, quantityAfter }, now);
    return {
      movement: { id: movementRef.id, productId: product.id, productName: product.name, sku: product.sku, type: values.type, source: "MANUAL", quantity: movement.quantity, quantityDelta, quantityAfter, reason: values.reason, reference: values.reference, invoiceId: null, createdByName: session.displayName, createdAt: now.toDate().toISOString() },
      product: { ...product, quantityOnHand: quantityAfter, lowStock, version: product.version + 1, updatedAt: now.toDate().toISOString() },
    };
  });
}

export async function listStockMovements(session: AppSession, input: StockMovementListFiltersInput): Promise<{ movements: StockMovement[]; filters: StockMovementListFilters; nextCursor: string | null }> {
  assertSession(session);
  const filters = stockMovementListFiltersSchema.parse(input);
  let query: Query = adminDb.collection("stockMovements").where("organizationId", "==", session.organizationId);
  if (filters.productId) query = query.where("productId", "==", filters.productId);
  if (filters.type !== "ALL") query = query.where("type", "==", filters.type);
  query = query.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (filters.cursor) {
    const snapshot = await adminDb.collection("stockMovements").doc(filters.cursor).get();
    let cursor: StockMovement;
    try { cursor = toMovement(snapshot, session); } catch (error) {
      if (error instanceof ProductNotFoundError) throw new ProductCursorError();
      throw error;
    }
    if ((filters.productId && cursor.productId !== filters.productId) || (filters.type !== "ALL" && cursor.type !== filters.type)) throw new ProductCursorError();
    query = query.startAfter(snapshot);
  }
  const snapshot = await query.limit(STOCK_PAGE_SIZE + 1).get();
  const movements = snapshot.docs.slice(0, STOCK_PAGE_SIZE).map((doc) => toMovement(doc, session));
  return { movements, filters, nextCursor: snapshot.docs.length > STOCK_PAGE_SIZE ? movements[movements.length - 1].id : null };
}

export async function listRecentMovementsForProduct(session: AppSession, productId: string, limit = 10): Promise<StockMovement[]> {
  assertSession(session);
  if (!productIdSchema.safeParse(productId).success) throw new ProductNotFoundError();
  const snapshot = await adminDb.collection("stockMovements").where("organizationId", "==", session.organizationId).where("productId", "==", productId)
    .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(limit).get();
  return snapshot.docs.map((doc) => toMovement(doc, session));
}

export async function listLowStockProducts(session: AppSession, limit = 8): Promise<ProductDetail[]> {
  assertSession(session);
  const snapshot = await adminDb.collection("products").where("organizationId", "==", session.organizationId).where("isActive", "==", true).where("lowStock", "==", true)
    .orderBy("nameSearch", "asc").orderBy(FieldPath.documentId(), "asc").limit(limit).get();
  return snapshot.docs.map((doc) => toProduct(doc, session));
}

/** Active catalog items for quotation and invoice line pickers. */
export async function listProductOptions(session: AppSession, input: ProductOptionsInput): Promise<ProductOptions> {
  assertCatalogSession(session);
  const filters = productOptionsSchema.parse(input);
  const prefix = normalizeProductName(filters.q);
  let query: Query = adminDb.collection("products").where("organizationId", "==", session.organizationId).where("isActive", "==", true);
  if (prefix) {
    query = query.where("nameSearch", ">=", prefix);
    const upper = prefixUpperBound(prefix);
    if (upper) query = query.where("nameSearch", "<", upper);
  }
  query = query.orderBy("nameSearch", "asc").orderBy(FieldPath.documentId(), "asc");
  if (filters.cursor) {
    const snapshot = await adminDb.collection("products").doc(filters.cursor).get();
    let cursor: ProductDetail;
    try { cursor = toProduct(snapshot, session); } catch (error) {
      if (error instanceof ProductNotFoundError) throw new ProductCursorError();
      throw error;
    }
    if (!cursor.isActive || !normalizeProductName(cursor.name).startsWith(prefix)) throw new ProductCursorError();
    query = query.startAfter(snapshot);
  }
  const snapshot = await query.limit(PRODUCT_OPTION_PAGE_SIZE + 1).get();
  const options: ProductOption[] = snapshot.docs.slice(0, PRODUCT_OPTION_PAGE_SIZE).map((doc) => {
    const product = toProduct(doc, session);
    return { id: product.id, name: product.name, secondary: `${product.sku}${product.trackStock ? ` · ${product.quantityOnHand} ${product.unit} on hand` : ""}`, unitPrice: product.unitPrice, taxRatePercent: product.taxRatePercent, unit: product.unit };
  });
  return { options, nextCursor: snapshot.docs.length > PRODUCT_OPTION_PAGE_SIZE ? options[options.length - 1].id : null };
}

// ---------------------------------------------------------------------------
// Stock effects of billing documents. Callers run these inside their own
// transaction and must finish all reads (loadStockProducts) before any write.
// ---------------------------------------------------------------------------

export interface StockLine { productId: string; quantity: number }
export interface StockConsumption { productId: string; quantity: number }

export async function loadStockProducts(transaction: Transaction, session: AppSession, productIds: readonly string[]): Promise<Map<string, ProductDetail>> {
  const unique = [...new Set(productIds)];
  for (const id of unique) if (!productIdSchema.safeParse(id).success) throw new ProductNotFoundError();
  const products = new Map<string, ProductDetail>();
  if (!unique.length) return products;
  const snapshots = await transaction.getAll(...unique.map((id) => adminDb.collection("products").doc(id)));
  for (const snapshot of snapshots) products.set(snapshot.id, toProduct(snapshot, session));
  return products;
}

/** Deduct tracked products for an issued invoice. Returns what was consumed so a void can restore it. */
export function consumeStock(transaction: Transaction, session: AppSession, products: Map<string, ProductDetail>, lines: readonly StockLine[], context: { invoiceId: string; invoiceNumber: string }, now: Timestamp): StockConsumption[] {
  const totals = new Map<string, number>();
  for (const line of lines) totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
  const consumed: StockConsumption[] = [];
  for (const [productId, quantity] of totals) {
    const product = products.get(productId);
    if (!product) throw new ProductNotFoundError();
    if (!product.trackStock) continue;
    if (!Number.isInteger(quantity)) throw new StockRuleError("FRACTIONAL_QUANTITY", product.name);
    const quantityAfter = product.quantityOnHand - quantity;
    if (quantityAfter < 0) throw new StockRuleError("INSUFFICIENT_STOCK", product.name);
    const lowStock = isLow(true, quantityAfter, product.reorderLevel);
    transaction.create(adminDb.collection("stockMovements").doc(`mv_${hash([session.organizationId, context.invoiceId, "ISSUE", productId])}`), {
      organizationId: session.organizationId, productId, productName: product.name, sku: product.sku, type: "OUT", source: "INVOICE_ISSUED", quantity, quantityDelta: -quantity, quantityAfter,
      reason: "Issued on invoice", reference: context.invoiceNumber, invoiceId: context.invoiceId, createdBy: session.uid, createdByName: session.displayName, createdAt: now,
    });
    transaction.update(adminDb.collection("products").doc(productId), { quantityOnHand: quantityAfter, lowStock, version: product.version + 1, updatedAt: now });
    consumed.push({ productId, quantity });
  }
  return consumed;
}

/** Return stock deducted by an invoice that is being voided. */
export function restoreStock(transaction: Transaction, session: AppSession, products: Map<string, ProductDetail>, consumed: readonly StockConsumption[], context: { invoiceId: string; invoiceNumber: string }, now: Timestamp) {
  for (const item of consumed) {
    const product = products.get(item.productId);
    if (!product) throw new ProductNotFoundError();
    const quantityAfter = Math.min(MAX_STOCK_QUANTITY, product.quantityOnHand + item.quantity);
    const lowStock = isLow(product.trackStock, quantityAfter, product.reorderLevel);
    transaction.create(adminDb.collection("stockMovements").doc(`mv_${hash([session.organizationId, context.invoiceId, "VOID", item.productId])}`), {
      organizationId: session.organizationId, productId: item.productId, productName: product.name, sku: product.sku, type: "IN", source: "INVOICE_VOIDED", quantity: item.quantity, quantityDelta: quantityAfter - product.quantityOnHand, quantityAfter,
      reason: "Invoice voided", reference: context.invoiceNumber, invoiceId: context.invoiceId, createdBy: session.uid, createdByName: session.displayName, createdAt: now,
    });
    transaction.update(adminDb.collection("products").doc(item.productId), { quantityOnHand: quantityAfter, lowStock, version: product.version + 1, updatedAt: now });
  }
}
