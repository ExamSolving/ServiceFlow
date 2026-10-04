import "server-only";

import { createHash } from "node:crypto";
import { FieldPath, Timestamp, type DocumentSnapshot, type Query, type Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import type { AppSession } from "@/src/features/auth/types/app-session";
import { normalizeCustomerName } from "@/src/features/customers/schemas/customer.schema";
import { normalizeServiceTypeName } from "@/src/features/service-types/schemas/service-type.schema";
import { hasPermission } from "@/src/lib/auth/permissions";
import { adminDb } from "@/src/lib/firebase/admin";
import {
  normalizeRequestTitle, serviceRequestCreateSchema, serviceRequestFormSchema, serviceRequestIdSchema,
  serviceRequestListFiltersSchema, serviceRequestOptionsSchema, serviceRequestStatuses, serviceRequestTransitionSchema,
  serviceRequestUpdateSchema,
  type ServiceRequestCreateInput, type ServiceRequestOptionsInput, type ServiceRequestTransitionInput, type ServiceRequestUpdateInput,
} from "../schemas/service-request.schema";
import type { ServiceRequestDetail, ServiceRequestListData, ServiceRequestListFilters, ServiceRequestOption, ServiceRequestOptions } from "../types/service-request";
import { canEditServiceRequest, nextServiceRequestStatus } from "../utils/request-workflow";
import {
  ServiceRequestAccessError, ServiceRequestConflictError, ServiceRequestCursorError, ServiceRequestNotFoundError,
  ServiceRequestReferenceError, ServiceRequestTransitionError,
} from "./service-request-errors";

export const SERVICE_REQUEST_PAGE_SIZE = 25;
export const SERVICE_REQUEST_OPTION_PAGE_SIZE = 10;
const editableFields = ["customerId", "serviceTypeId", "title", "description", "priority"] as const;
const recordSchema = serviceRequestFormSchema.extend({
  organizationId: serviceRequestIdSchema,
  titleSearch: z.string().min(1),
  status: z.enum(serviceRequestStatuses),
  customerName: z.string().min(1),
  customerNumber: z.string().min(1),
  serviceTypeName: z.string().min(1),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).passthrough();
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

type ReferenceSnapshot = { customerName: string; customerNumber: string; serviceTypeName: string };

function assertSession(session: AppSession) {
  if (!serviceRequestIdSchema.safeParse(session.organizationId).success || !serviceRequestIdSchema.safeParse(session.uid).success || !hasPermission(session.role, "manageServiceRequests")) {
    throw new ServiceRequestAccessError();
  }
}

function timestampToIso(value: unknown) {
  if (!(value instanceof Timestamp)) throw new Error("Invalid service request timestamp");
  return value.toDate().toISOString();
}

function toServiceRequest(snapshot: DocumentSnapshot, session: AppSession): ServiceRequestDetail {
  const data = snapshot.data();
  // Check ownership before parsing or exposing any data, including cursor records.
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId) throw new ServiceRequestNotFoundError();
  const record = recordSchema.parse(data);
  if (!serviceRequestIdSchema.safeParse(snapshot.id).success || record.titleSearch !== normalizeRequestTitle(record.title)) {
    throw new Error("Invalid service request search index or identifier");
  }
  return {
    id: snapshot.id,
    ...(data.convertedJobId === undefined ? {} : { convertedJobId: serviceRequestIdSchema.parse(data.convertedJobId) }),
    customerId: record.customerId,
    serviceTypeId: record.serviceTypeId,
    title: record.title,
    description: record.description,
    priority: record.priority,
    status: record.status,
    customerName: record.customerName,
    customerNumber: record.customerNumber,
    serviceTypeName: record.serviceTypeName,
    version: record.version,
    requestedAt: timestampToIso(data.requestedAt),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

// Referenced records must belong to this tenant and be active. Nothing about a
// foreign record is exposed: any mismatch reports the same reference error.
function customerReference(snapshot: DocumentSnapshot, session: AppSession): { customerName: string; customerNumber: string } {
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId || data.isActive !== true ||
      typeof data.name !== "string" || !data.name.trim() || typeof data.customerNumber !== "string" || !data.customerNumber) {
    throw new ServiceRequestReferenceError("customerId");
  }
  return { customerName: data.name, customerNumber: data.customerNumber };
}

function serviceTypeReference(snapshot: DocumentSnapshot, session: AppSession): { serviceTypeName: string } {
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId || data.isActive !== true || typeof data.name !== "string" || !data.name.trim()) {
    throw new ServiceRequestReferenceError("serviceTypeId");
  }
  return { serviceTypeName: data.name };
}

async function resolveReferences(transaction: Transaction, session: AppSession, customerId: string, serviceTypeId: string): Promise<ReferenceSnapshot> {
  const customer = await transaction.get(adminDb.collection("customers").doc(customerId));
  const serviceType = await transaction.get(adminDb.collection("serviceTypes").doc(serviceTypeId));
  return { ...customerReference(customer, session), ...serviceTypeReference(serviceType, session) };
}

function formatDuration(minutes: unknown): string | undefined {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return undefined;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${minutes} min`;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function toOption(snapshot: DocumentSnapshot, session: AppSession, kind: ServiceRequestOptionsInput["kind"]): ServiceRequestOption {
  if (kind === "customers") {
    const reference = customerReference(snapshot, session);
    return { id: snapshot.id, name: reference.customerName, secondary: reference.customerNumber };
  }
  const reference = serviceTypeReference(snapshot, session);
  return { id: snapshot.id, name: reference.serviceTypeName, secondary: formatDuration(snapshot.data()?.estimatedDurationMinutes) };
}

function prefixUpperBound(prefix: string): string | undefined {
  const points = Array.from(prefix);
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index].codePointAt(0)!;
    if (point < 0x10ffff) return points.slice(0, index).join("") + String.fromCodePoint(point === 0xd7ff ? 0xe000 : point + 1);
  }
  return undefined;
}

export async function listServiceRequests(session: AppSession, input: ServiceRequestListFilters): Promise<ServiceRequestListData> {
  assertSession(session);
  const filters = serviceRequestListFiltersSchema.parse(input);
  const prefix = normalizeRequestTitle(filters.q);
  let query: Query = adminDb.collection("serviceRequests").where("organizationId", "==", session.organizationId);
  if (filters.status !== "ALL") query = query.where("status", "==", filters.status);
  if (filters.priority !== "ALL") query = query.where("priority", "==", filters.priority);
  if (prefix) {
    // A title search orders by title; the queue otherwise shows the newest requests first.
    query = query.where("titleSearch", ">=", prefix);
    const upperBound = prefixUpperBound(prefix);
    if (upperBound) query = query.where("titleSearch", "<", upperBound);
    query = query.orderBy("titleSearch", "asc").orderBy(FieldPath.documentId(), "asc");
  } else {
    query = query.orderBy("requestedAt", "desc").orderBy(FieldPath.documentId(), "desc");
  }
  if (filters.cursor) {
    const snapshot = await adminDb.collection("serviceRequests").doc(filters.cursor).get();
    let cursor: ServiceRequestDetail;
    try { cursor = toServiceRequest(snapshot, session); } catch (error) {
      if (error instanceof ServiceRequestNotFoundError) throw new ServiceRequestCursorError();
      throw error;
    }
    if ((filters.status !== "ALL" && cursor.status !== filters.status) || (filters.priority !== "ALL" && cursor.priority !== filters.priority) ||
        !normalizeRequestTitle(cursor.title).startsWith(prefix)) {
      throw new ServiceRequestCursorError();
    }
    query = query.startAfter(snapshot);
  }
  const snapshot = await query.limit(SERVICE_REQUEST_PAGE_SIZE + 1).get();
  const requests = snapshot.docs.slice(0, SERVICE_REQUEST_PAGE_SIZE).map((document) => toServiceRequest(document, session));
  return { requests, filters, nextCursor: snapshot.docs.length > SERVICE_REQUEST_PAGE_SIZE ? requests[requests.length - 1].id : null };
}

export async function readServiceRequest(session: AppSession, serviceRequestId: string): Promise<ServiceRequestDetail> {
  assertSession(session);
  if (!serviceRequestIdSchema.safeParse(serviceRequestId).success) throw new ServiceRequestNotFoundError();
  return toServiceRequest(await adminDb.collection("serviceRequests").doc(serviceRequestId).get(), session);
}

// Active customers or service types of this tenant, for the request form pickers.
export async function listServiceRequestOptions(session: AppSession, input: ServiceRequestOptionsInput): Promise<ServiceRequestOptions> {
  assertSession(session);
  const filters = serviceRequestOptionsSchema.parse(input);
  const collection = filters.kind === "customers" ? "customers" : "serviceTypes";
  const prefix = filters.kind === "customers" ? normalizeCustomerName(filters.q) : normalizeServiceTypeName(filters.q);
  let query: Query = adminDb.collection(collection).where("organizationId", "==", session.organizationId).where("isActive", "==", true);
  if (prefix) {
    query = query.where("nameSearch", ">=", prefix);
    const upperBound = prefixUpperBound(prefix);
    if (upperBound) query = query.where("nameSearch", "<", upperBound);
  }
  query = query.orderBy("nameSearch", "asc").orderBy(FieldPath.documentId(), "asc");
  if (filters.cursor) {
    const snapshot = await adminDb.collection(collection).doc(filters.cursor).get();
    let cursor: ServiceRequestOption;
    try { cursor = toOption(snapshot, session, filters.kind); } catch (error) {
      if (error instanceof ServiceRequestReferenceError) throw new ServiceRequestCursorError();
      throw error;
    }
    const cursorSearch = filters.kind === "customers" ? normalizeCustomerName(cursor.name) : normalizeServiceTypeName(cursor.name);
    if (!cursorSearch.startsWith(prefix)) throw new ServiceRequestCursorError();
    query = query.startAfter(snapshot);
  }
  const snapshot = await query.limit(SERVICE_REQUEST_OPTION_PAGE_SIZE + 1).get();
  const options = snapshot.docs.slice(0, SERVICE_REQUEST_OPTION_PAGE_SIZE).map((document) => toOption(document, session, filters.kind));
  return { options, nextCursor: snapshot.docs.length > SERVICE_REQUEST_OPTION_PAGE_SIZE ? options[options.length - 1].id : null };
}

export async function createServiceRequest(session: AppSession, input: ServiceRequestCreateInput): Promise<ServiceRequestDetail> {
  assertSession(session);
  const { requestId, ...values } = serviceRequestCreateSchema.parse(input);
  const key = hash([session.organizationId, session.uid, requestId]);
  const payloadHash = hash(values);
  const reference = adminDb.collection("serviceRequests").doc(`sr_${key}`);
  const auditRef = adminDb.collection("auditLogs").doc();
  const titleSearch = normalizeRequestTitle(values.title);
  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    if (existing.exists) {
      const record = toServiceRequest(existing, session);
      const data = existing.data()!;
      if (data.createdBy !== session.uid || data.creationKey !== key || data.creationPayloadHash !== payloadHash) throw new ServiceRequestConflictError();
      return record;
    }
    // References are resolved after the replay check so a completed request stays replayable
    // even if the customer or service type has since been deactivated.
    const references = await resolveReferences(transaction, session, values.customerId, values.serviceTypeId);
    const now = Timestamp.now();
    transaction.create(reference, {
      ...values, ...references,
      organizationId: session.organizationId, titleSearch, status: "NEW", version: 1,
      requestedAt: now, createdAt: now, updatedAt: now, createdBy: session.uid, creationKey: key, creationPayloadHash: payloadHash,
    });
    transaction.create(auditRef, {
      organizationId: session.organizationId, actorUserId: session.uid,
      action: "SERVICE_REQUEST_CREATED", entityType: "SERVICE_REQUEST", entityId: reference.id,
      metadata: { version: 1, priority: values.priority, customerId: values.customerId, serviceTypeId: values.serviceTypeId }, createdAt: now,
    });
    const iso = now.toDate().toISOString();
    return { ...values, ...references, id: reference.id, status: "NEW", version: 1, requestedAt: iso, createdAt: iso, updatedAt: iso };
  });
}

export async function updateServiceRequest(session: AppSession, serviceRequestId: string, input: ServiceRequestUpdateInput): Promise<ServiceRequestDetail> {
  assertSession(session);
  if (!serviceRequestIdSchema.safeParse(serviceRequestId).success) throw new ServiceRequestNotFoundError();
  const { version, ...values } = serviceRequestUpdateSchema.parse(input);
  const reference = adminDb.collection("serviceRequests").doc(serviceRequestId);
  const auditRef = adminDb.collection("auditLogs").doc();
  return adminDb.runTransaction(async (transaction) => {
    const current = toServiceRequest(await transaction.get(reference), session);
    if (current.version !== version) throw new ServiceRequestConflictError();
    if (!canEditServiceRequest(current.status)) throw new ServiceRequestTransitionError();
    const changedFields = editableFields.filter((field) => current[field] !== values[field]);
    if (!changedFields.length) return current;
    // Only a changed reference is re-validated, so a request can still be edited after
    // its existing customer or service type was deactivated.
    const references: ReferenceSnapshot = { customerName: current.customerName, customerNumber: current.customerNumber, serviceTypeName: current.serviceTypeName };
    if (values.customerId !== current.customerId) {
      Object.assign(references, customerReference(await transaction.get(adminDb.collection("customers").doc(values.customerId)), session));
    }
    if (values.serviceTypeId !== current.serviceTypeId) {
      Object.assign(references, serviceTypeReference(await transaction.get(adminDb.collection("serviceTypes").doc(values.serviceTypeId)), session));
    }
    const now = Timestamp.now();
    const nextVersion = version + 1;
    transaction.update(reference, { ...values, ...references, titleSearch: normalizeRequestTitle(values.title), version: nextVersion, updatedAt: now });
    transaction.create(auditRef, {
      organizationId: session.organizationId, actorUserId: session.uid,
      action: "SERVICE_REQUEST_UPDATED", entityType: "SERVICE_REQUEST", entityId: serviceRequestId,
      metadata: { changedFields, version: nextVersion }, createdAt: now,
    });
    return { ...current, ...values, ...references, version: nextVersion, updatedAt: now.toDate().toISOString() };
  });
}

export async function transitionServiceRequest(session: AppSession, serviceRequestId: string, input: ServiceRequestTransitionInput): Promise<ServiceRequestDetail> {
  assertSession(session);
  if (!serviceRequestIdSchema.safeParse(serviceRequestId).success) throw new ServiceRequestNotFoundError();
  const { action, version } = serviceRequestTransitionSchema.parse(input);
  const reference = adminDb.collection("serviceRequests").doc(serviceRequestId);
  const auditRef = adminDb.collection("auditLogs").doc();
  return adminDb.runTransaction(async (transaction) => {
    const current = toServiceRequest(await transaction.get(reference), session);
    if (current.version !== version) throw new ServiceRequestConflictError();
    const status = nextServiceRequestStatus(current.status, action);
    if (!status) throw new ServiceRequestTransitionError();
    const now = Timestamp.now();
    const nextVersion = version + 1;
    transaction.update(reference, { status, version: nextVersion, updatedAt: now });
    transaction.create(auditRef, {
      organizationId: session.organizationId, actorUserId: session.uid,
      action: "SERVICE_REQUEST_STATUS_CHANGED", entityType: "SERVICE_REQUEST", entityId: serviceRequestId,
      metadata: { action, from: current.status, to: status, version: nextVersion }, createdAt: now,
    });
    return { ...current, status, version: nextVersion, updatedAt: now.toDate().toISOString() };
  });
}
