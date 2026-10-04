import "server-only";

import { createHash } from "node:crypto";
import { FieldPath, Timestamp, type DocumentReference, type DocumentSnapshot, type Query, type Transaction } from "firebase-admin/firestore";
import { z } from "zod";

import type { JobStatus } from "@/../../packages/domain/src/job";
import type { AppSession } from "@/src/features/auth/types/app-session";
import { advanceJob, readCustomerReference, readJobReference, type JobReference } from "@/src/features/billing/repositories/billing-references";
import { nextDocumentNumber, readBillingSettings } from "@/src/features/billing/repositories/billing-settings";
import { localDate } from "@/src/features/dashboard/utils/date";
import { consumeStock, loadStockProducts, restoreStock, type StockConsumption } from "@/src/features/products/repositories/product.repository";
import { addCalendarDays, markQuotationConverted, readQuotationForConversion } from "@/src/features/quotations/repositories/quotation.repository";
import { quotationConvertSchema, type QuotationConvertInput } from "@/src/features/quotations/schemas/quotation.schema";
import { hasPermission } from "@/src/lib/auth/permissions";
import { computeTotals, type LineItemInput } from "@/src/lib/billing/line-items";
import { fromMinor, toMinor } from "@/src/lib/billing/money";
import { adminDb } from "@/src/lib/firebase/admin";
import {
  invoiceActionSchema, invoiceCreateSchema, invoiceDetailSchema, invoiceIdSchema, invoiceListFiltersSchema, invoiceUpdateSchema, normalizeInvoiceTitle, openInvoiceStatuses,
  type InvoiceActionInput, type InvoiceCreateInput, type InvoiceListFiltersInput, type InvoiceUpdateInput,
} from "../schemas/invoice.schema";
import type { InvoiceDetail, InvoiceListData } from "../types/invoice";
import { InvoiceAccessError, InvoiceConflictError, InvoiceCursorError, InvoiceNotFoundError, InvoiceRuleError, InvoiceStateError } from "./invoice-errors";

export const INVOICE_PAGE_SIZE = 25;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const consumedSchema = z.array(z.object({ productId: invoiceIdSchema, quantity: z.number().int().positive() })).catch([]);

function assertSession(session: AppSession) {
  if (!invoiceIdSchema.safeParse(session.uid).success || !invoiceIdSchema.safeParse(session.organizationId).success || !hasPermission(session.role, "manageInvoices")) throw new InvoiceAccessError();
}
/** Read-only access for payment recording, job pages and quotation pages. */
function assertReadSession(session: AppSession) {
  if (!invoiceIdSchema.safeParse(session.uid).success || !invoiceIdSchema.safeParse(session.organizationId).success) throw new InvoiceAccessError();
  if (!hasPermission(session.role, "manageInvoices") && !hasPermission(session.role, "recordPayments") && !hasPermission(session.role, "dispatchJobs") && !hasPermission(session.role, "manageQuotations")) throw new InvoiceAccessError();
}
function iso(value: unknown) {
  if (!(value instanceof Timestamp)) throw new Error("Invalid invoice timestamp");
  return value.toDate().toISOString();
}
const optionalIso = (value: unknown) => (value == null ? null : iso(value));

export function toInvoice(snapshot: DocumentSnapshot, session: AppSession): InvoiceDetail {
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId) throw new InvoiceNotFoundError();
  const parsed = invoiceDetailSchema.strip().parse({
    ...data, id: snapshot.id, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt), issuedAt: optionalIso(data.issuedAt), paidAt: optionalIso(data.paidAt), voidedAt: optionalIso(data.voidedAt),
    jobId: data.jobId ?? null, jobNumber: data.jobNumber ?? null, quotationId: data.quotationId ?? null, quotationNumber: data.quotationNumber ?? null, dueAt: data.dueAt ?? null, notes: data.notes ?? "",
    amountPaid: data.amountPaid ?? 0, balanceDue: data.balanceDue ?? data.total,
  });
  if (data.titleSearch !== normalizeInvoiceTitle(parsed.title)) throw new Error("Invalid invoice search index");
  return parsed;
}
function audit(transaction: Transaction, session: AppSession, id: string, action: string, metadata: Record<string, unknown>, now: Timestamp) {
  transaction.create(adminDb.collection("auditLogs").doc(), { organizationId: session.organizationId, actorUserId: session.uid, entityType: "INVOICE", entityId: id, action, metadata, createdAt: now });
}
async function references(transaction: Transaction, session: AppSession, values: { customerId: string; jobId: string | null }, allowInactiveCustomer: boolean) {
  const customer = await readCustomerReference(transaction, session, values.customerId, allowInactiveCustomer);
  const job = values.jobId ? await readJobReference(transaction, session, values.jobId, values.customerId) : null;
  return { customerName: customer.customerName, customerNumber: customer.customerNumber, jobNumber: job?.jobNumber ?? null, job };
}
function prefixUpperBound(prefix: string): string | undefined {
  const points = Array.from(prefix);
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i].codePointAt(0)!;
    if (point < 0x10ffff) return points.slice(0, i).join("") + String.fromCodePoint(point === 0xd7ff ? 0xe000 : point + 1);
  }
}
const editable = (q: Pick<InvoiceDetail, "customerId" | "jobId" | "title" | "notes" | "dueAt" | "lineItems">) => JSON.stringify({
  customerId: q.customerId, jobId: q.jobId, title: q.title, notes: q.notes, dueAt: q.dueAt,
  lineItems: q.lineItems.map((item) => ({ productId: item.productId, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, taxRatePercent: item.taxRatePercent })),
});

async function insertDraft(transaction: Transaction, session: AppSession, ref: DocumentReference, values: { customerId: string; jobId: string | null; title: string; notes: string; dueAt: string | null; lineItems: LineItemInput[] },
  refs: { customerName: string; customerNumber: string; jobNumber: string | null }, quotation: { id: string; quotationNumber: string } | null, creation: Record<string, unknown>, invoicePrefix: string, currency: string, now: Timestamp): Promise<InvoiceDetail> {
  const numbering = await nextDocumentNumber(transaction, session.organizationId, "invoice", invoicePrefix);
  const totals = computeTotals(values.lineItems);
  const record = {
    invoiceNumber: numbering.number, status: "DRAFT" as const, customerId: values.customerId, customerName: refs.customerName, customerNumber: refs.customerNumber, jobId: values.jobId, jobNumber: refs.jobNumber,
    quotationId: quotation?.id ?? null, quotationNumber: quotation?.quotationNumber ?? null, title: values.title, notes: values.notes, currency, lineItems: totals.lineItems,
    subtotal: totals.subtotal, taxTotal: totals.taxTotal, total: totals.total, amountPaid: 0, balanceDue: totals.total, dueAt: values.dueAt, issuedAt: null, paidAt: null, voidedAt: null, version: 1,
  };
  transaction.create(ref, { ...record, ...creation, organizationId: session.organizationId, titleSearch: normalizeInvoiceTitle(values.title), stockConsumed: [], createdBy: session.uid, createdAt: now, updatedAt: now });
  transaction.set(numbering.counterRef, { organizationId: session.organizationId, lastNumber: numbering.nextNumber, updatedAt: now });
  audit(transaction, session, ref.id, "INVOICE_CREATED", { invoiceNumber: numbering.number, jobId: values.jobId, quotationId: quotation?.id ?? null, total: totals.total, version: 1 }, now);
  return { ...record, id: ref.id, createdAt: now.toDate().toISOString(), updatedAt: now.toDate().toISOString() };
}

export async function listInvoices(session: AppSession, input: InvoiceListFiltersInput): Promise<Omit<InvoiceListData, "today">> {
  assertSession(session);
  const filters = invoiceListFiltersSchema.parse(input);
  const prefix = normalizeInvoiceTitle(filters.q);
  let query: Query = adminDb.collection("invoices").where("organizationId", "==", session.organizationId);
  if (filters.status !== "ALL") query = query.where("status", "==", filters.status);
  if (prefix) {
    query = query.where("titleSearch", ">=", prefix);
    const upper = prefixUpperBound(prefix);
    if (upper) query = query.where("titleSearch", "<", upper);
    query = query.orderBy("titleSearch", "asc").orderBy(FieldPath.documentId(), "asc");
  } else {
    query = query.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  }
  if (filters.cursor) {
    const snapshot = await adminDb.collection("invoices").doc(filters.cursor).get();
    let cursor: InvoiceDetail;
    try { cursor = toInvoice(snapshot, session); } catch (error) {
      if (error instanceof InvoiceNotFoundError) throw new InvoiceCursorError();
      throw error;
    }
    if ((filters.status !== "ALL" && cursor.status !== filters.status) || !normalizeInvoiceTitle(cursor.title).startsWith(prefix)) throw new InvoiceCursorError();
    query = query.startAfter(snapshot);
  }
  const snapshot = await query.limit(INVOICE_PAGE_SIZE + 1).get();
  const invoices = snapshot.docs.slice(0, INVOICE_PAGE_SIZE).map((doc) => toInvoice(doc, session));
  return { invoices, filters, nextCursor: snapshot.docs.length > INVOICE_PAGE_SIZE ? invoices[invoices.length - 1].id : null };
}

export async function readInvoice(session: AppSession, id: string): Promise<InvoiceDetail> {
  assertReadSession(session);
  if (!invoiceIdSchema.safeParse(id).success) throw new InvoiceNotFoundError();
  return toInvoice(await adminDb.collection("invoices").doc(id).get(), session);
}

export async function listInvoicesForJob(session: AppSession, jobId: string, limit = 20): Promise<InvoiceDetail[]> {
  assertReadSession(session);
  if (!invoiceIdSchema.safeParse(jobId).success) throw new InvoiceNotFoundError();
  const snapshot = await adminDb.collection("invoices").where("organizationId", "==", session.organizationId).where("jobId", "==", jobId)
    .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(limit).get();
  return snapshot.docs.map((doc) => toInvoice(doc, session));
}

export async function createInvoice(session: AppSession, input: InvoiceCreateInput): Promise<InvoiceDetail> {
  assertSession(session);
  const { requestId, ...values } = invoiceCreateSchema.parse(input);
  const key = hash([session.organizationId, session.uid, requestId]);
  const payloadHash = hash(values);
  const ref = adminDb.collection("invoices").doc(`inv_${key}`);
  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const record = toInvoice(existing, session);
      const data = existing.data()!;
      if (data.createdBy !== session.uid || data.creationKey !== key || data.creationPayloadHash !== payloadHash) throw new InvoiceConflictError();
      return record;
    }
    const settings = await readBillingSettings(session.organizationId, transaction);
    const refs = await references(transaction, session, values, false);
    return insertDraft(transaction, session, ref, values, refs, null, { creationKey: key, creationPayloadHash: payloadHash }, settings.invoiceNumberPrefix, settings.currency, Timestamp.now());
  });
}

/** Create a draft invoice carrying an approved quotation's lines; the quotation records the link. */
export async function createInvoiceFromQuotation(session: AppSession, quotationId: string, input: QuotationConvertInput): Promise<InvoiceDetail> {
  assertSession(session);
  const { requestId, version } = quotationConvertSchema.parse(input);
  const key = hash([session.organizationId, session.uid, requestId]);
  const ref = adminDb.collection("invoices").doc(`inv_${key}`);
  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const record = toInvoice(existing, session);
      const data = existing.data()!;
      if (data.createdBy !== session.uid || data.creationKey !== key || data.quotationId !== quotationId) throw new InvoiceConflictError();
      return record;
    }
    const quotation = await readQuotationForConversion(transaction, session, quotationId, version);
    const settings = await readBillingSettings(session.organizationId, transaction);
    const values = { customerId: quotation.customerId, jobId: quotation.jobId, title: quotation.title, notes: quotation.notes, dueAt: null,
      lineItems: quotation.lineItems.map((item) => ({ productId: item.productId, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, taxRatePercent: item.taxRatePercent })) };
    const refs = await references(transaction, session, values, true);
    const now = Timestamp.now();
    const invoice = await insertDraft(transaction, session, ref, values, refs, { id: quotation.id, quotationNumber: quotation.quotationNumber }, { creationKey: key }, settings.invoiceNumberPrefix, quotation.currency, now);
    markQuotationConverted(transaction, session, quotation, invoice, now);
    return invoice;
  });
}

export async function updateInvoice(session: AppSession, id: string, input: InvoiceUpdateInput): Promise<InvoiceDetail> {
  assertSession(session);
  if (!invoiceIdSchema.safeParse(id).success) throw new InvoiceNotFoundError();
  const { version, ...values } = invoiceUpdateSchema.parse(input);
  const ref = adminDb.collection("invoices").doc(id);
  return adminDb.runTransaction(async (transaction) => {
    const current = toInvoice(await transaction.get(ref), session);
    if (current.version !== version) throw new InvoiceConflictError();
    if (current.status !== "DRAFT") throw new InvoiceStateError();
    const totals = computeTotals(values.lineItems);
    const next = { customerId: values.customerId, jobId: values.jobId, title: values.title, notes: values.notes, dueAt: values.dueAt, lineItems: totals.lineItems };
    if (editable(next) === editable(current)) return current;
    const refs = await references(transaction, session, values, current.customerId === values.customerId);
    const now = Timestamp.now();
    const update = { ...next, customerName: refs.customerName, customerNumber: refs.customerNumber, jobNumber: refs.jobNumber, subtotal: totals.subtotal, taxTotal: totals.taxTotal, total: totals.total, balanceDue: totals.total, version: version + 1 };
    transaction.update(ref, { ...update, titleSearch: normalizeInvoiceTitle(values.title), updatedAt: now });
    audit(transaction, session, id, "INVOICE_UPDATED", { total: totals.total, version: version + 1 }, now);
    return { ...current, ...update, updatedAt: now.toDate().toISOString() };
  });
}

function issuePath(job: JobReference | null): JobStatus[] {
  if (!job) return [];
  if (job.status === "COMPLETED") return ["INVOICED"];
  if (job.status === "INVOICED" || job.status === "PARTIAL" || job.status === "PAID") return [];
  throw new InvoiceRuleError("JOB_NOT_COMPLETED");
}

/** Issue a draft (locks lines, deducts tracked stock, marks the job invoiced) or void an unpaid invoice. */
export async function transitionInvoice(session: AppSession, id: string, input: InvoiceActionInput): Promise<InvoiceDetail> {
  assertSession(session);
  if (!invoiceIdSchema.safeParse(id).success) throw new InvoiceNotFoundError();
  const { action, version, note } = invoiceActionSchema.parse(input);
  const ref = adminDb.collection("invoices").doc(id);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = toInvoice(snapshot, session);
    if (current.version !== version) throw new InvoiceConflictError();
    const now = Timestamp.now();
    if (action === "ISSUE") {
      if (current.status !== "DRAFT") throw new InvoiceStateError();
      const settings = await readBillingSettings(session.organizationId, transaction);
      const job = current.jobId ? await readJobReference(transaction, session, current.jobId, current.customerId) : null;
      const path = issuePath(job);
      const stockLines = current.lineItems.filter((item): item is typeof item & { productId: string } => item.productId !== null).map((item) => ({ productId: item.productId, quantity: item.quantity }));
      const products = await loadStockProducts(transaction, session, stockLines.map((line) => line.productId));
      const dueAt = current.dueAt ?? addCalendarDays(localDate(now.toDate(), settings.timezone), settings.invoiceDueDays);
      const consumed = consumeStock(transaction, session, products, stockLines, { invoiceId: id, invoiceNumber: current.invoiceNumber }, now);
      transaction.update(ref, { status: "ISSUED", issuedAt: now, dueAt, amountPaid: 0, balanceDue: current.total, stockConsumed: consumed, version: version + 1, updatedAt: now });
      audit(transaction, session, id, "INVOICE_ISSUED", { invoiceNumber: current.invoiceNumber, total: current.total, dueAt, stockConsumed: consumed, version: version + 1, ...(note ? { note } : {}) }, now);
      if (job) advanceJob(transaction, session, job, path, { invoiceId: id, invoiceNumber: current.invoiceNumber }, now);
      return { ...current, status: "ISSUED", issuedAt: now.toDate().toISOString(), dueAt, amountPaid: 0, balanceDue: current.total, version: version + 1, updatedAt: now.toDate().toISOString() };
    }
    if (current.amountPaid > 0) throw new InvoiceRuleError("HAS_PAYMENTS");
    if (current.status !== "DRAFT" && current.status !== "ISSUED") throw new InvoiceStateError();
    const consumed: StockConsumption[] = current.status === "ISSUED" ? consumedSchema.parse(snapshot.data()?.stockConsumed) : [];
    const products = await loadStockProducts(transaction, session, consumed.map((item) => item.productId));
    restoreStock(transaction, session, products, consumed, { invoiceId: id, invoiceNumber: current.invoiceNumber }, now);
    transaction.update(ref, { status: "VOID", voidedAt: now, balanceDue: 0, version: version + 1, updatedAt: now });
    audit(transaction, session, id, "INVOICE_VOIDED", { invoiceNumber: current.invoiceNumber, from: current.status, restoredStock: consumed, version: version + 1, ...(note ? { note } : {}) }, now);
    return { ...current, status: "VOID", voidedAt: now.toDate().toISOString(), balanceDue: 0, version: version + 1, updatedAt: now.toDate().toISOString() };
  });
}

// ---------------------------------------------------------------------------
// Payment application, run inside the payments repository's transaction.
// ---------------------------------------------------------------------------

export async function readInvoiceForPayment(transaction: Transaction, session: AppSession, invoiceId: string): Promise<InvoiceDetail> {
  if (!invoiceIdSchema.safeParse(invoiceId).success) throw new InvoiceNotFoundError();
  return toInvoice(await transaction.get(adminDb.collection("invoices").doc(invoiceId)), session);
}
export const isOpenInvoice = (invoice: Pick<InvoiceDetail, "status">) => (openInvoiceStatuses as readonly string[]).includes(invoice.status);

/** Apply a payment amount; returns the invoice fields after the payment. Caller validates the amount. */
export function applyPayment(transaction: Transaction, session: AppSession, invoice: InvoiceDetail, amount: number, payment: { id: string; method: string }, now: Timestamp): Pick<InvoiceDetail, "status" | "amountPaid" | "balanceDue" | "paidAt" | "version"> {
  const amountPaid = fromMinor(toMinor(invoice.amountPaid) + toMinor(amount));
  const balanceDue = fromMinor(Math.max(0, toMinor(invoice.total) - toMinor(amountPaid)));
  const status = balanceDue === 0 ? "PAID" as const : "PARTIALLY_PAID" as const;
  const paidAt = status === "PAID" ? now : null;
  transaction.update(adminDb.collection("invoices").doc(invoice.id), { status, amountPaid, balanceDue, ...(paidAt ? { paidAt } : {}), version: invoice.version + 1, updatedAt: now });
  audit(transaction, session, invoice.id, "INVOICE_PAYMENT_APPLIED", { paymentId: payment.id, method: payment.method, amount, amountPaid, balanceDue, status, version: invoice.version + 1 }, now);
  return { status, amountPaid, balanceDue, paidAt: paidAt ? paidAt.toDate().toISOString() : invoice.paidAt, version: invoice.version + 1 };
}
