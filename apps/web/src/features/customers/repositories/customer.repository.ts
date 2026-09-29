import "server-only";

import { createHash } from "node:crypto";
import { FieldPath, Timestamp, type DocumentSnapshot, type Query } from "firebase-admin/firestore";
import { z } from "zod";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { hasPermission } from "@/src/lib/auth/permissions";
import { adminDb } from "@/src/lib/firebase/admin";
import {
  customerCreateSchema, customerFormSchema, customerIdSchema,
  customerListFiltersSchema, customerUpdateSchema, normalizeCustomerName,
  type CustomerCreateInput, type CustomerUpdateInput,
} from "../schemas/customer.schema";
import type { CustomerDetail, CustomerListData, CustomerListFilters } from "../types/customer";
import { CustomerAccessError, CustomerConflictError, CustomerCursorError, CustomerNotFoundError } from "./customer-errors";

export const CUSTOMER_PAGE_SIZE = 25;
const editableFields = ["type", "name", "email", "phone", "notes", "isActive"] as const;
const recordSchema = customerFormSchema.extend({
  email: customerFormSchema.shape.email.default(""),
  notes: customerFormSchema.shape.notes.default(""),
  organizationId: customerIdSchema,
  customerNumber: z.string().regex(/^CUS-\d{6,}$/),
  nameSearch: z.string().min(1),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).passthrough();

function assertSession(session: AppSession) {
  if (!customerIdSchema.safeParse(session.organizationId).success || !session.uid || !hasPermission(session.role, "manageCustomers")) {
    throw new CustomerAccessError();
  }
}

function timestampToIso(value: unknown): string {
  if (!(value instanceof Timestamp)) throw new Error("Invalid customer timestamp");
  return value.toDate().toISOString();
}

function toCustomer(snapshot: DocumentSnapshot, session: AppSession): CustomerDetail {
  const value = snapshot.data();
  // Always check ownership before parsing or returning any record data.
  if (!snapshot.exists || !value || value.organizationId !== session.organizationId) {
    throw new CustomerNotFoundError();
  }
  const record = recordSchema.parse(value);
  if (record.nameSearch !== normalizeCustomerName(record.name)) throw new Error("Invalid customer search index");
  return {
    id: snapshot.id,
    customerNumber: record.customerNumber,
    type: record.type,
    name: record.name,
    email: record.email,
    phone: record.phone,
    notes: record.notes,
    isActive: record.isActive,
    version: record.version,
    createdAt: timestampToIso(value.createdAt),
    updatedAt: timestampToIso(value.updatedAt),
  };
}

// A Unicode-aware exclusive upper bound avoids losing names containing emoji
// or other characters beyond the commonly used \uf8ff sentinel.
function prefixUpperBound(prefix: string): string | undefined {
  const points = Array.from(prefix);
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index].codePointAt(0)!;
    if (point < 0x10ffff) {
      const next = point === 0xd7ff ? 0xe000 : point + 1;
      return points.slice(0, index).join("") + String.fromCodePoint(next);
    }
  }
  return undefined;
}

export async function listCustomers(session: AppSession, input: CustomerListFilters): Promise<CustomerListData> {
  assertSession(session);
  const filters = customerListFiltersSchema.parse(input);
  const prefix = normalizeCustomerName(filters.q);
  let query: Query = adminDb.collection("customers").where("organizationId", "==", session.organizationId);
  if (filters.status !== "ALL") query = query.where("isActive", "==", filters.status === "ACTIVE");
  if (prefix) {
    query = query.where("nameSearch", ">=", prefix);
    const upperBound = prefixUpperBound(prefix);
    if (upperBound) query = query.where("nameSearch", "<", upperBound);
  }
  query = query.orderBy("nameSearch", "asc").orderBy(FieldPath.documentId(), "asc");
  if (filters.cursor) {
    const snapshot = await adminDb.collection("customers").doc(filters.cursor).get();
    let cursor: CustomerDetail;
    try { cursor = toCustomer(snapshot, session); } catch (error) {
      if (error instanceof CustomerNotFoundError) throw new CustomerCursorError();
      throw error;
    }
    if ((filters.status !== "ALL" && cursor.isActive !== (filters.status === "ACTIVE")) || !normalizeCustomerName(cursor.name).startsWith(prefix)) {
      throw new CustomerCursorError();
    }
    query = query.startAfter(snapshot);
  }
  const snapshot = await query.limit(CUSTOMER_PAGE_SIZE + 1).get();
  // The tenant predicate is also verified per document in case storage is inconsistent.
  const customers = snapshot.docs.slice(0, CUSTOMER_PAGE_SIZE).map((document) => toCustomer(document, session));
  return {
    customers,
    filters,
    nextCursor: snapshot.docs.length > CUSTOMER_PAGE_SIZE ? customers[customers.length - 1].id : null,
  };
}

export async function readCustomer(session: AppSession, customerId: string): Promise<CustomerDetail> {
  assertSession(session);
  if (!customerIdSchema.safeParse(customerId).success) throw new CustomerNotFoundError();
  const snapshot = await adminDb.collection("customers").doc(customerId).get();
  return toCustomer(snapshot, session);
}

export async function createCustomer(session: AppSession, input: CustomerCreateInput): Promise<CustomerDetail> {
  assertSession(session);
  const { requestId, ...values } = customerCreateSchema.parse(input);
  const key = createHash("sha256").update(JSON.stringify([session.organizationId, session.uid, requestId])).digest("hex");
  const payloadHash = createHash("sha256").update(JSON.stringify(values)).digest("hex");
  const customerRef = adminDb.collection("customers").doc(`cus_${key}`);
  const counterRef = adminDb.collection("customerCounters").doc(session.organizationId);
  const auditRef = adminDb.collection("auditLogs").doc();

  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(customerRef);
    if (existing.exists) {
      const customer = toCustomer(existing, session);
      const data = existing.data()!;
      if (data.createdBy !== session.uid || data.creationKey !== key || data.creationPayloadHash !== payloadHash) throw new CustomerConflictError();
      return customer;
    }
    const counterSnapshot = await transaction.get(counterRef);
    const counter = counterSnapshot.data();
    if (counterSnapshot.exists && (counterSnapshot.id !== session.organizationId || counter?.organizationId !== session.organizationId || !Number.isSafeInteger(counter.lastNumber) || counter.lastNumber < 0)) {
      throw new Error("Invalid customer counter ownership or sequence");
    }
    if (!counterSnapshot.exists) {
      // A legacy tenant must have its sequence initialized deliberately; never
      // restart at one and silently reuse an existing customer number.
      const existingCustomers = await transaction.get(adminDb.collection("customers").where("organizationId", "==", session.organizationId).limit(1));
      if (!existingCustomers.empty) throw new Error("Existing customers require counter migration");
    }
    const nextNumber: number = (counter?.lastNumber ?? 0) + 1;
    if (!Number.isSafeInteger(nextNumber)) throw new Error("Customer sequence exhausted");
    const now = Timestamp.now();
    const customerNumber = `CUS-${String(nextNumber).padStart(6, "0")}`;
    transaction.create(customerRef, {
      ...values,
      organizationId: session.organizationId,
      customerNumber,
      nameSearch: normalizeCustomerName(values.name),
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: session.uid,
      creationKey: key,
      creationPayloadHash: payloadHash,
    });
    transaction.set(counterRef, { organizationId: session.organizationId, lastNumber: nextNumber, updatedAt: now }, { merge: true });
    transaction.create(auditRef, {
      organizationId: session.organizationId,
      actorUserId: session.uid,
      action: "CUSTOMER_CREATED",
      entityType: "CUSTOMER",
      entityId: customerRef.id,
      metadata: { customerNumber },
      createdAt: now,
    });
    return { ...values, id: customerRef.id, customerNumber, version: 1, createdAt: now.toDate().toISOString(), updatedAt: now.toDate().toISOString() };
  });
}

export async function updateCustomer(session: AppSession, customerId: string, input: CustomerUpdateInput): Promise<CustomerDetail> {
  assertSession(session);
  if (!customerIdSchema.safeParse(customerId).success) throw new CustomerNotFoundError();
  const { version, ...values } = customerUpdateSchema.parse(input);
  const customerRef = adminDb.collection("customers").doc(customerId);
  const auditRef = adminDb.collection("auditLogs").doc();

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(customerRef);
    const current = toCustomer(snapshot, session);
    if (current.version !== version) throw new CustomerConflictError();
    const changedFields = editableFields.filter((field) => current[field] !== values[field]);
    if (!changedFields.length) return current;
    const now = Timestamp.now();
    const nextVersion = version + 1;
    transaction.update(customerRef, { ...values, nameSearch: normalizeCustomerName(values.name), version: nextVersion, updatedAt: now });
    transaction.create(auditRef, {
      organizationId: session.organizationId,
      actorUserId: session.uid,
      action: "CUSTOMER_UPDATED",
      entityType: "CUSTOMER",
      entityId: customerId,
      metadata: { changedFields, version: nextVersion },
      createdAt: now,
    });
    return { ...current, ...values, version: nextVersion, updatedAt: now.toDate().toISOString() };
  });
}
