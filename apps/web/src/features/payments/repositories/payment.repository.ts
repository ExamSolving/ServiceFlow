import "server-only";

import { createHash } from "node:crypto";
import { FieldPath, Timestamp, type DocumentSnapshot, type Query } from "firebase-admin/firestore";

import type { JobStatus } from "@/../../packages/domain/src/job";
import type { AppSession } from "@/src/features/auth/types/app-session";
import { advanceJob, readJobReference, type JobReference } from "@/src/features/billing/repositories/billing-references";
import { applyPayment, isOpenInvoice, readInvoiceForPayment } from "@/src/features/invoices/repositories/invoice.repository";
import type { InvoiceDetail } from "@/src/features/invoices/types/invoice";
import { hasPermission } from "@/src/lib/auth/permissions";
import { toMinor } from "@/src/lib/billing/money";
import { adminDb } from "@/src/lib/firebase/admin";
import { paymentCreateSchema, paymentDetailSchema, paymentIdSchema, paymentListFiltersSchema, type PaymentCreateInput, type PaymentListFiltersInput } from "../schemas/payment.schema";
import type { PaymentDetail, PaymentListData } from "../types/payment";
import { PaymentAccessError, PaymentConflictError, PaymentCursorError, PaymentNotFoundError, PaymentRuleError } from "./payment-errors";

export const PAYMENT_PAGE_SIZE = 50;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function assertSession(session: AppSession) {
  if (!paymentIdSchema.safeParse(session.uid).success || !paymentIdSchema.safeParse(session.organizationId).success || !hasPermission(session.role, "recordPayments")) throw new PaymentAccessError();
}
function assertReadSession(session: AppSession) {
  if (!paymentIdSchema.safeParse(session.uid).success || !paymentIdSchema.safeParse(session.organizationId).success) throw new PaymentAccessError();
  if (!hasPermission(session.role, "recordPayments") && !hasPermission(session.role, "manageInvoices")) throw new PaymentAccessError();
}
function iso(value: unknown) {
  if (!(value instanceof Timestamp)) throw new Error("Invalid payment timestamp");
  return value.toDate().toISOString();
}
function toPayment(snapshot: DocumentSnapshot, session: AppSession): PaymentDetail {
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId) throw new PaymentNotFoundError();
  return paymentDetailSchema.strip().parse({ ...data, id: snapshot.id, paidAt: iso(data.paidAt), createdAt: iso(data.createdAt), reference: data.reference ?? "", notes: data.notes ?? "", recordedByName: data.recordedByName ?? "" });
}
function paymentPath(job: JobReference | null, invoice: Pick<InvoiceDetail, "status">): JobStatus[] {
  if (!job) return [];
  if (invoice.status === "PAID") return job.status === "INVOICED" || job.status === "PARTIAL" ? ["PAID"] : [];
  return job.status === "INVOICED" ? ["PARTIAL"] : [];
}

/** Record money received against an open invoice; updates the invoice and a linked job atomically. */
export async function recordPayment(session: AppSession, input: PaymentCreateInput): Promise<{ payment: PaymentDetail; invoice: InvoiceDetail }> {
  assertSession(session);
  const { requestId, ...values } = paymentCreateSchema.parse(input);
  const key = hash([session.organizationId, session.uid, requestId]);
  const payloadHash = hash(values);
  const ref = adminDb.collection("payments").doc(`pay_${key}`);
  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const invoice = await readInvoiceForPayment(transaction, session, values.invoiceId);
    if (existing.exists) {
      const data = existing.data()!;
      if (data.recordedBy !== session.uid || data.creationKey !== key || data.creationPayloadHash !== payloadHash) throw new PaymentConflictError();
      return { payment: toPayment(existing, session), invoice };
    }
    if (!isOpenInvoice(invoice)) throw new PaymentRuleError("INVOICE_NOT_OPEN");
    if (toMinor(values.amount) > toMinor(invoice.balanceDue)) throw new PaymentRuleError("EXCEEDS_BALANCE");
    const job = invoice.jobId ? await readJobReference(transaction, session, invoice.jobId, invoice.customerId) : null;
    const now = Timestamp.now();
    const paidAt = Timestamp.fromDate(new Date(values.paidAt));
    const record = {
      organizationId: session.organizationId, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, customerId: invoice.customerId, customerName: invoice.customerName,
      amount: values.amount, currency: invoice.currency, method: values.method, paidAt, reference: values.reference, notes: values.notes,
      recordedBy: session.uid, recordedByName: session.displayName, createdAt: now, creationKey: key, creationPayloadHash: payloadHash,
    };
    transaction.create(ref, record);
    const applied = applyPayment(transaction, session, invoice, values.amount, { id: ref.id, method: values.method }, now);
    transaction.create(adminDb.collection("auditLogs").doc(), { organizationId: session.organizationId, actorUserId: session.uid, entityType: "PAYMENT", entityId: ref.id, action: "PAYMENT_RECORDED", metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: values.amount, method: values.method }, createdAt: now });
    const updatedInvoice: InvoiceDetail = { ...invoice, ...applied, updatedAt: now.toDate().toISOString() };
    if (job) advanceJob(transaction, session, job, paymentPath(job, updatedInvoice), { invoiceId: invoice.id, paymentId: ref.id }, now);
    return {
      payment: { id: ref.id, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, customerId: invoice.customerId, customerName: invoice.customerName, amount: values.amount, currency: invoice.currency, method: values.method, paidAt: paidAt.toDate().toISOString(), reference: values.reference, notes: values.notes, recordedByName: session.displayName, createdAt: now.toDate().toISOString() },
      invoice: updatedInvoice,
    };
  });
}

export async function listPayments(session: AppSession, input: PaymentListFiltersInput): Promise<Omit<PaymentListData, "timezone">> {
  assertReadSession(session);
  const filters = paymentListFiltersSchema.parse(input);
  let query: Query = adminDb.collection("payments").where("organizationId", "==", session.organizationId);
  if (filters.invoiceId) query = query.where("invoiceId", "==", filters.invoiceId);
  if (filters.method !== "ALL") query = query.where("method", "==", filters.method);
  query = query.orderBy("paidAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (filters.cursor) {
    const snapshot = await adminDb.collection("payments").doc(filters.cursor).get();
    let cursor: PaymentDetail;
    try { cursor = toPayment(snapshot, session); } catch (error) {
      if (error instanceof PaymentNotFoundError) throw new PaymentCursorError();
      throw error;
    }
    if ((filters.invoiceId && cursor.invoiceId !== filters.invoiceId) || (filters.method !== "ALL" && cursor.method !== filters.method)) throw new PaymentCursorError();
    query = query.startAfter(snapshot);
  }
  const snapshot = await query.limit(PAYMENT_PAGE_SIZE + 1).get();
  const payments = snapshot.docs.slice(0, PAYMENT_PAGE_SIZE).map((doc) => toPayment(doc, session));
  return { payments, filters, nextCursor: snapshot.docs.length > PAYMENT_PAGE_SIZE ? payments[payments.length - 1].id : null };
}

export async function listPaymentsForInvoice(session: AppSession, invoiceId: string, limit = 50): Promise<PaymentDetail[]> {
  assertReadSession(session);
  if (!paymentIdSchema.safeParse(invoiceId).success) throw new PaymentNotFoundError();
  const snapshot = await adminDb.collection("payments").where("organizationId", "==", session.organizationId).where("invoiceId", "==", invoiceId)
    .orderBy("paidAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(limit).get();
  return snapshot.docs.map((doc) => toPayment(doc, session));
}
