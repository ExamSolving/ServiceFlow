import "server-only";

import { FieldPath, type DocumentSnapshot, type Query } from "firebase-admin/firestore";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { normalizeCustomerName } from "@/src/features/customers/schemas/customer.schema";
import type { ServiceRequestOption, ServiceRequestOptions } from "@/src/features/service-requests/types/service-request";
import { hasPermission } from "@/src/lib/auth/permissions";
import { adminDb } from "@/src/lib/firebase/admin";
import { billingCustomerOptionsSchema, billingIdSchema, type BillingCustomerOptionsInput } from "../schemas/billing.schema";

export class BillingAccessError extends Error {
  constructor() { super("Billing access denied"); this.name = "BillingAccessError"; }
}
export class BillingCursorError extends Error {
  constructor() { super("Billing option page is no longer available"); this.name = "BillingCursorError"; }
}

const PAGE_SIZE = 10;

function assertBillingSession(session: AppSession) {
  if (!billingIdSchema.safeParse(session.organizationId).success || !billingIdSchema.safeParse(session.uid).success) throw new BillingAccessError();
  if (!hasPermission(session.role, "manageQuotations") && !hasPermission(session.role, "manageInvoices")) throw new BillingAccessError();
}
function prefixUpperBound(prefix: string): string | undefined {
  const points = Array.from(prefix);
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i].codePointAt(0)!;
    if (point < 0x10ffff) return points.slice(0, i).join("") + String.fromCodePoint(point === 0xd7ff ? 0xe000 : point + 1);
  }
}
function toOption(snapshot: DocumentSnapshot, session: AppSession): ServiceRequestOption {
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId || typeof data.name !== "string" || typeof data.customerNumber !== "string") throw new BillingCursorError();
  return { id: snapshot.id, name: data.name, secondary: data.customerNumber };
}

/** Active customers for quotation and invoice forms; billing roles do not need manageCustomers. */
export async function listBillingCustomerOptions(session: AppSession, input: BillingCustomerOptionsInput): Promise<ServiceRequestOptions> {
  assertBillingSession(session);
  const filters = billingCustomerOptionsSchema.parse(input);
  const prefix = normalizeCustomerName(filters.q);
  let query: Query = adminDb.collection("customers").where("organizationId", "==", session.organizationId).where("isActive", "==", true);
  if (prefix) {
    query = query.where("nameSearch", ">=", prefix);
    const upper = prefixUpperBound(prefix);
    if (upper) query = query.where("nameSearch", "<", upper);
  }
  query = query.orderBy("nameSearch", "asc").orderBy(FieldPath.documentId(), "asc");
  if (filters.cursor) {
    const snapshot = await adminDb.collection("customers").doc(filters.cursor).get();
    const cursor = toOption(snapshot, session);
    if (snapshot.data()?.isActive !== true || !normalizeCustomerName(cursor.name).startsWith(prefix)) throw new BillingCursorError();
    query = query.startAfter(snapshot);
  }
  const snapshot = await query.limit(PAGE_SIZE + 1).get();
  const options = snapshot.docs.slice(0, PAGE_SIZE).map((doc) => toOption(doc, session));
  return { options, nextCursor: snapshot.docs.length > PAGE_SIZE ? options[options.length - 1].id : null };
}
