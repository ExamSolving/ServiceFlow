import "server-only";

import { createHash } from "node:crypto";
import { FieldPath, Timestamp, type DocumentSnapshot, type Query, type Transaction } from "firebase-admin/firestore";

import type { JobStatus } from "@/../../packages/domain/src/job";
import type { AppSession } from "@/src/features/auth/types/app-session";
import { advanceJob, readCustomerReference, readJobReference, type JobReference } from "@/src/features/billing/repositories/billing-references";
import { nextDocumentNumber, readBillingSettings } from "@/src/features/billing/repositories/billing-settings";
import { localDate } from "@/src/features/dashboard/utils/date";
import { hasPermission } from "@/src/lib/auth/permissions";
import { computeTotals } from "@/src/lib/billing/line-items";
import { adminDb } from "@/src/lib/firebase/admin";
import {
  normalizeQuotationTitle, quotationActionSchema, quotationCreateSchema, quotationDetailSchema, quotationIdSchema, quotationListFiltersSchema, quotationUpdateSchema,
  type QuotationActionInput, type QuotationCreateInput, type QuotationListFiltersInput, type QuotationUpdateInput,
} from "../schemas/quotation.schema";
import type { QuotationDetail, QuotationListData } from "../types/quotation";
import { QuotationAccessError, QuotationConflictError, QuotationCursorError, QuotationNotFoundError, QuotationRuleError, QuotationStateError } from "./quotation-errors";

export const QUOTATION_PAGE_SIZE = 25;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ACTIVE_STATUSES = ["SENT", "APPROVED"] as const;

function assertSession(session: AppSession) {
  if (!quotationIdSchema.safeParse(session.uid).success || !quotationIdSchema.safeParse(session.organizationId).success || !hasPermission(session.role, "manageQuotations")) throw new QuotationAccessError();
}
/** Read-only access for job pages and invoice conversion. */
function assertReadSession(session: AppSession) {
  if (!quotationIdSchema.safeParse(session.uid).success || !quotationIdSchema.safeParse(session.organizationId).success) throw new QuotationAccessError();
  if (!hasPermission(session.role, "manageQuotations") && !hasPermission(session.role, "manageInvoices") && !hasPermission(session.role, "dispatchJobs")) throw new QuotationAccessError();
}
function iso(value: unknown) {
  if (!(value instanceof Timestamp)) throw new Error("Invalid quotation timestamp");
  return value.toDate().toISOString();
}
const optionalIso = (value: unknown) => (value == null ? null : iso(value));

export function toQuotation(snapshot: DocumentSnapshot, session: AppSession): QuotationDetail {
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId) throw new QuotationNotFoundError();
  const parsed = quotationDetailSchema.strip().parse({
    ...data, id: snapshot.id, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt), sentAt: optionalIso(data.sentAt), decidedAt: optionalIso(data.decidedAt),
    jobId: data.jobId ?? null, jobNumber: data.jobNumber ?? null, invoiceId: data.invoiceId ?? null, invoiceNumber: data.invoiceNumber ?? null, notes: data.notes ?? "",
  });
  if (data.titleSearch !== normalizeQuotationTitle(parsed.title)) throw new Error("Invalid quotation search index");
  return parsed;
}
function audit(transaction: Transaction, session: AppSession, id: string, action: string, metadata: Record<string, unknown>, now: Timestamp) {
  transaction.create(adminDb.collection("auditLogs").doc(), { organizationId: session.organizationId, actorUserId: session.uid, entityType: "QUOTATION", entityId: id, action, metadata, createdAt: now });
}
export function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
async function references(transaction: Transaction, session: AppSession, values: { customerId: string; jobId: string | null }, current?: QuotationDetail) {
  const customer = await readCustomerReference(transaction, session, values.customerId, current?.customerId === values.customerId);
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
const editable = (q: Pick<QuotationDetail, "customerId" | "jobId" | "title" | "notes" | "validUntil" | "lineItems">) => JSON.stringify({
  customerId: q.customerId, jobId: q.jobId, title: q.title, notes: q.notes, validUntil: q.validUntil,
  lineItems: q.lineItems.map((item) => ({ productId: item.productId, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, taxRatePercent: item.taxRatePercent })),
});

export async function listQuotations(session: AppSession, input: QuotationListFiltersInput): Promise<Omit<QuotationListData, "today">> {
  assertSession(session);
  const filters = quotationListFiltersSchema.parse(input);
  const prefix = normalizeQuotationTitle(filters.q);
  let query: Query = adminDb.collection("quotations").where("organizationId", "==", session.organizationId);
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
    const snapshot = await adminDb.collection("quotations").doc(filters.cursor).get();
    let cursor: QuotationDetail;
    try { cursor = toQuotation(snapshot, session); } catch (error) {
      if (error instanceof QuotationNotFoundError) throw new QuotationCursorError();
      throw error;
    }
    if ((filters.status !== "ALL" && cursor.status !== filters.status) || !normalizeQuotationTitle(cursor.title).startsWith(prefix)) throw new QuotationCursorError();
    query = query.startAfter(snapshot);
  }
  const snapshot = await query.limit(QUOTATION_PAGE_SIZE + 1).get();
  const quotations = snapshot.docs.slice(0, QUOTATION_PAGE_SIZE).map((doc) => toQuotation(doc, session));
  return { quotations, filters, nextCursor: snapshot.docs.length > QUOTATION_PAGE_SIZE ? quotations[quotations.length - 1].id : null };
}

export async function readQuotation(session: AppSession, id: string): Promise<QuotationDetail> {
  assertReadSession(session);
  if (!quotationIdSchema.safeParse(id).success) throw new QuotationNotFoundError();
  return toQuotation(await adminDb.collection("quotations").doc(id).get(), session);
}

export async function listQuotationsForJob(session: AppSession, jobId: string, limit = 20): Promise<QuotationDetail[]> {
  assertReadSession(session);
  if (!quotationIdSchema.safeParse(jobId).success) throw new QuotationNotFoundError();
  const snapshot = await adminDb.collection("quotations").where("organizationId", "==", session.organizationId).where("jobId", "==", jobId)
    .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(limit).get();
  return snapshot.docs.map((doc) => toQuotation(doc, session));
}

export async function createQuotation(session: AppSession, input: QuotationCreateInput): Promise<QuotationDetail> {
  assertSession(session);
  const { requestId, ...values } = quotationCreateSchema.parse(input);
  const key = hash([session.organizationId, session.uid, requestId]);
  const payloadHash = hash(values);
  const ref = adminDb.collection("quotations").doc(`quo_${key}`);
  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const record = toQuotation(existing, session);
      const data = existing.data()!;
      if (data.createdBy !== session.uid || data.creationKey !== key || data.creationPayloadHash !== payloadHash) throw new QuotationConflictError();
      return record;
    }
    const settings = await readBillingSettings(session.organizationId, transaction);
    const refs = await references(transaction, session, values);
    const numbering = await nextDocumentNumber(transaction, session.organizationId, "quotation", settings.quotationNumberPrefix);
    const totals = computeTotals(values.lineItems);
    const now = Timestamp.now();
    const validUntil = values.validUntil ?? addCalendarDays(localDate(now.toDate(), settings.timezone), settings.quoteValidityDays);
    const record = {
      quotationNumber: numbering.number, status: "DRAFT" as const, customerId: values.customerId, customerName: refs.customerName, customerNumber: refs.customerNumber,
      jobId: values.jobId, jobNumber: refs.jobNumber, title: values.title, notes: values.notes, currency: settings.currency, lineItems: totals.lineItems,
      subtotal: totals.subtotal, taxTotal: totals.taxTotal, total: totals.total, validUntil, sentAt: null, decidedAt: null, invoiceId: null, invoiceNumber: null, version: 1,
    };
    transaction.create(ref, { ...record, organizationId: session.organizationId, titleSearch: normalizeQuotationTitle(values.title), createdBy: session.uid, createdAt: now, updatedAt: now, creationKey: key, creationPayloadHash: payloadHash });
    transaction.set(numbering.counterRef, { organizationId: session.organizationId, lastNumber: numbering.nextNumber, updatedAt: now });
    audit(transaction, session, ref.id, "QUOTATION_CREATED", { quotationNumber: numbering.number, jobId: values.jobId, total: totals.total, version: 1 }, now);
    return { ...record, id: ref.id, createdAt: now.toDate().toISOString(), updatedAt: now.toDate().toISOString() };
  });
}

export async function updateQuotation(session: AppSession, id: string, input: QuotationUpdateInput): Promise<QuotationDetail> {
  assertSession(session);
  if (!quotationIdSchema.safeParse(id).success) throw new QuotationNotFoundError();
  const { version, ...values } = quotationUpdateSchema.parse(input);
  const ref = adminDb.collection("quotations").doc(id);
  return adminDb.runTransaction(async (transaction) => {
    const current = toQuotation(await transaction.get(ref), session);
    if (current.version !== version) throw new QuotationConflictError();
    if (current.status !== "DRAFT") throw new QuotationStateError();
    const totals = computeTotals(values.lineItems);
    const validUntil = values.validUntil ?? current.validUntil;
    const next = { customerId: values.customerId, jobId: values.jobId, title: values.title, notes: values.notes, validUntil, lineItems: totals.lineItems };
    if (editable(next) === editable(current)) return current;
    const refs = await references(transaction, session, values, current);
    const now = Timestamp.now();
    const update = { ...next, customerName: refs.customerName, customerNumber: refs.customerNumber, jobNumber: refs.jobNumber, subtotal: totals.subtotal, taxTotal: totals.taxTotal, total: totals.total, version: version + 1 };
    transaction.update(ref, { ...update, titleSearch: normalizeQuotationTitle(values.title), updatedAt: now });
    audit(transaction, session, id, "QUOTATION_UPDATED", { total: totals.total, version: version + 1 }, now);
    return { ...current, ...update, updatedAt: now.toDate().toISOString() };
  });
}

const TRANSITIONS: Record<QuotationActionInput["action"], { from: QuotationDetail["status"]; to: QuotationDetail["status"] }> = {
  SEND: { from: "DRAFT", to: "SENT" }, APPROVE: { from: "SENT", to: "APPROVED" }, REJECT: { from: "SENT", to: "REJECTED" }, EXPIRE: { from: "SENT", to: "EXPIRED" },
};
function jobPath(action: QuotationActionInput["action"], job: JobReference | null): JobStatus[] {
  if (!job) return [];
  if (action === "SEND") return job.status === "DIAGNOSING" ? ["QUOTATION_REQUIRED", "WAITING_APPROVAL"] : job.status === "QUOTATION_REQUIRED" ? ["WAITING_APPROVAL"] : [];
  if (action === "APPROVE") return job.status === "WAITING_APPROVAL" ? ["APPROVED"] : [];
  return [];
}

/** Send, approve, reject or expire a quotation, moving a linked job along with it. */
export async function transitionQuotation(session: AppSession, id: string, input: QuotationActionInput): Promise<QuotationDetail> {
  assertSession(session);
  if (!quotationIdSchema.safeParse(id).success) throw new QuotationNotFoundError();
  const { action, version, note } = quotationActionSchema.parse(input);
  const ref = adminDb.collection("quotations").doc(id);
  return adminDb.runTransaction(async (transaction) => {
    const current = toQuotation(await transaction.get(ref), session);
    if (current.version !== version) throw new QuotationConflictError();
    const transition = TRANSITIONS[action];
    if (current.status !== transition.from) throw new QuotationStateError();
    const job = current.jobId ? await readJobReference(transaction, session, current.jobId, current.customerId) : null;
    if (action === "SEND" && current.jobId) {
      const active = await transaction.get(adminDb.collection("quotations").where("organizationId", "==", session.organizationId).where("jobId", "==", current.jobId).where("status", "in", [...ACTIVE_STATUSES]).limit(2));
      if (active.docs.some((doc) => doc.id !== id)) throw new QuotationRuleError("JOB_HAS_ACTIVE_QUOTATION");
    }
    const now = Timestamp.now();
    const stamps = action === "SEND" ? { sentAt: now } : { decidedAt: now };
    transaction.update(ref, { status: transition.to, ...stamps, version: version + 1, updatedAt: now });
    audit(transaction, session, id, "QUOTATION_STATUS_CHANGED", { from: current.status, to: transition.to, version: version + 1, ...(note ? { note } : {}) }, now);
    if (job) advanceJob(transaction, session, job, jobPath(action, job), { quotationId: id, quotationNumber: current.quotationNumber }, now);
    return { ...current, status: transition.to, sentAt: action === "SEND" ? now.toDate().toISOString() : current.sentAt, decidedAt: action === "SEND" ? current.decidedAt : now.toDate().toISOString(), version: version + 1, updatedAt: now.toDate().toISOString() };
  });
}

/** Used by invoice conversion inside its own transaction: the quotation must be approved and not yet converted. */
export async function readQuotationForConversion(transaction: Transaction, session: AppSession, quotationId: string, version: number): Promise<QuotationDetail> {
  if (!quotationIdSchema.safeParse(quotationId).success) throw new QuotationNotFoundError();
  const quotation = toQuotation(await transaction.get(adminDb.collection("quotations").doc(quotationId)), session);
  if (quotation.version !== version) throw new QuotationConflictError();
  if (quotation.invoiceId) throw new QuotationRuleError("ALREADY_CONVERTED");
  if (quotation.status !== "APPROVED") throw new QuotationStateError();
  return quotation;
}
export function markQuotationConverted(transaction: Transaction, session: AppSession, quotation: QuotationDetail, invoice: { id: string; invoiceNumber: string }, now: Timestamp) {
  transaction.update(adminDb.collection("quotations").doc(quotation.id), { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, version: quotation.version + 1, updatedAt: now });
  audit(transaction, session, quotation.id, "QUOTATION_CONVERTED", { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, version: quotation.version + 1 }, now);
}
