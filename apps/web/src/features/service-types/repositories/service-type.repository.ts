import "server-only";

import { createHash } from "node:crypto";
import { FieldPath, Timestamp, type DocumentSnapshot, type Query } from "firebase-admin/firestore";
import { z } from "zod";
import type { AppSession } from "@/src/features/auth/types/app-session";
import { hasPermission } from "@/src/lib/auth/permissions";
import { adminDb } from "@/src/lib/firebase/admin";
import { normalizeServiceTypeName, serviceTypeCreateSchema, serviceTypeFormSchema, serviceTypeIdSchema, serviceTypeListFiltersSchema, serviceTypeUpdateSchema, type ServiceTypeCreateInput, type ServiceTypeUpdateInput } from "../schemas/service-type.schema";
import type { ServiceTypeDetail, ServiceTypeListData, ServiceTypeListFilters } from "../types/service-type";
import { ServiceTypeAccessError, ServiceTypeConflictError, ServiceTypeCursorError, ServiceTypeDuplicateNameError, ServiceTypeNotFoundError } from "./service-type-errors";

export const SERVICE_TYPE_PAGE_SIZE = 25;
const editableFields = ["name", "description", "estimatedDurationMinutes", "isActive"] as const;
const recordSchema = serviceTypeFormSchema.extend({
  organizationId: serviceTypeIdSchema,
  nameSearch: z.string().min(1),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).passthrough();
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const nameRef = (organizationId: string, nameSearch: string) => adminDb.collection("serviceTypeNames").doc(hash([organizationId, nameSearch]));

function assertSession(session: AppSession) {
  if (!serviceTypeIdSchema.safeParse(session.organizationId).success || !serviceTypeIdSchema.safeParse(session.uid).success || !hasPermission(session.role, "manageServiceTypes")) throw new ServiceTypeAccessError();
}

function timestampToIso(value: unknown) {
  if (!(value instanceof Timestamp)) throw new Error("Invalid service type timestamp");
  return value.toDate().toISOString();
}

function toServiceType(snapshot: DocumentSnapshot, session: AppSession): ServiceTypeDetail {
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId) throw new ServiceTypeNotFoundError();
  const record = recordSchema.parse(data);
  if (!serviceTypeIdSchema.safeParse(snapshot.id).success || record.nameSearch !== normalizeServiceTypeName(record.name)) throw new Error("Invalid service type search index or identifier");
  return { id: snapshot.id, name: record.name, description: record.description, estimatedDurationMinutes: record.estimatedDurationMinutes, isActive: record.isActive, version: record.version, createdAt: timestampToIso(data.createdAt), updatedAt: timestampToIso(data.updatedAt) };
}

function assertReservation(snapshot: DocumentSnapshot, organizationId: string, nameSearch: string, serviceTypeId?: string) {
  if (!snapshot.exists) return;
  const data = snapshot.data()!;
  if (data.organizationId !== organizationId || data.nameSearch !== nameSearch || !serviceTypeIdSchema.safeParse(data.serviceTypeId).success) throw new Error("Invalid service type name reservation");
  if (serviceTypeId && data.serviceTypeId !== serviceTypeId) throw new Error("Service type name reservation ownership mismatch");
}

function prefixUpperBound(prefix: string): string | undefined {
  const points = Array.from(prefix);
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i].codePointAt(0)!;
    if (point < 0x10ffff) return points.slice(0, i).join("") + String.fromCodePoint(point === 0xd7ff ? 0xe000 : point + 1);
  }
}

export async function listServiceTypes(session: AppSession, input: ServiceTypeListFilters): Promise<ServiceTypeListData> {
  assertSession(session);
  const filters = serviceTypeListFiltersSchema.parse(input);
  const prefix = normalizeServiceTypeName(filters.q);
  let query: Query = adminDb.collection("serviceTypes").where("organizationId", "==", session.organizationId);
  if (filters.status !== "ALL") query = query.where("isActive", "==", filters.status === "ACTIVE");
  if (prefix) {
    query = query.where("nameSearch", ">=", prefix);
    const upper = prefixUpperBound(prefix);
    if (upper) query = query.where("nameSearch", "<", upper);
  }
  query = query.orderBy("nameSearch", "asc").orderBy(FieldPath.documentId(), "asc");
  if (filters.cursor) {
    const snapshot = await adminDb.collection("serviceTypes").doc(filters.cursor).get();
    let cursor: ServiceTypeDetail;
    try { cursor = toServiceType(snapshot, session); } catch (error) {
      if (error instanceof ServiceTypeNotFoundError) throw new ServiceTypeCursorError();
      throw error;
    }
    if ((filters.status !== "ALL" && cursor.isActive !== (filters.status === "ACTIVE")) || !normalizeServiceTypeName(cursor.name).startsWith(prefix)) throw new ServiceTypeCursorError();
    query = query.startAfter(snapshot);
  }
  const snapshot = await query.limit(SERVICE_TYPE_PAGE_SIZE + 1).get();
  const serviceTypes = snapshot.docs.slice(0, SERVICE_TYPE_PAGE_SIZE).map((doc) => toServiceType(doc, session));
  return { serviceTypes, filters, nextCursor: snapshot.docs.length > SERVICE_TYPE_PAGE_SIZE ? serviceTypes[serviceTypes.length - 1].id : null };
}

export async function readServiceType(session: AppSession, serviceTypeId: string): Promise<ServiceTypeDetail> {
  assertSession(session);
  if (!serviceTypeIdSchema.safeParse(serviceTypeId).success) throw new ServiceTypeNotFoundError();
  return toServiceType(await adminDb.collection("serviceTypes").doc(serviceTypeId).get(), session);
}

export async function createServiceType(session: AppSession, input: ServiceTypeCreateInput): Promise<ServiceTypeDetail> {
  assertSession(session);
  const { requestId, ...values } = serviceTypeCreateSchema.parse(input);
  const key = hash([session.organizationId, session.uid, requestId]);
  const payloadHash = hash(values);
  const reference = adminDb.collection("serviceTypes").doc(`st_${key}`);
  const nameSearch = normalizeServiceTypeName(values.name);
  const reservationRef = nameRef(session.organizationId, nameSearch);
  const auditRef = adminDb.collection("auditLogs").doc();
  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    if (existing.exists) {
      const record = toServiceType(existing, session);
      const data = existing.data()!;
      if (data.createdBy !== session.uid || data.creationKey !== key || data.creationPayloadHash !== payloadHash) throw new ServiceTypeConflictError();
      return record;
    }
    const reservation = await transaction.get(reservationRef);
    assertReservation(reservation, session.organizationId, nameSearch);
    if (reservation.exists) throw new ServiceTypeDuplicateNameError();
    // Also catch existing catalog records that predate name reservations.
    const duplicates = await transaction.get(adminDb.collection("serviceTypes").where("organizationId", "==", session.organizationId).where("nameSearch", "==", nameSearch).limit(1));
    if (!duplicates.empty) throw new ServiceTypeDuplicateNameError();
    const now = Timestamp.now();
    transaction.create(reference, { ...values, organizationId: session.organizationId, nameSearch, version: 1, createdAt: now, updatedAt: now, createdBy: session.uid, creationKey: key, creationPayloadHash: payloadHash });
    transaction.create(reservationRef, { organizationId: session.organizationId, nameSearch, serviceTypeId: reference.id, createdAt: now });
    transaction.create(auditRef, { organizationId: session.organizationId, actorUserId: session.uid, action: "SERVICE_TYPE_CREATED", entityType: "SERVICE_TYPE", entityId: reference.id, metadata: { version: 1 }, createdAt: now });
    return { ...values, id: reference.id, version: 1, createdAt: now.toDate().toISOString(), updatedAt: now.toDate().toISOString() };
  });
}

export async function updateServiceType(session: AppSession, serviceTypeId: string, input: ServiceTypeUpdateInput): Promise<ServiceTypeDetail> {
  assertSession(session);
  if (!serviceTypeIdSchema.safeParse(serviceTypeId).success) throw new ServiceTypeNotFoundError();
  const { version, ...values } = serviceTypeUpdateSchema.parse(input);
  const reference = adminDb.collection("serviceTypes").doc(serviceTypeId);
  const auditRef = adminDb.collection("auditLogs").doc();
  return adminDb.runTransaction(async (transaction) => {
    const current = toServiceType(await transaction.get(reference), session);
    if (current.version !== version) throw new ServiceTypeConflictError();
    const changedFields = editableFields.filter((field) => current[field] !== values[field]);
    if (!changedFields.length) return current;
    const oldName = normalizeServiceTypeName(current.name);
    const nameSearch = normalizeServiceTypeName(values.name);
    const oldRef = nameRef(session.organizationId, oldName);
    const newRef = nameRef(session.organizationId, nameSearch);
    let removeOldReservation = false;
    if (oldName !== nameSearch) {
      const oldReservation = await transaction.get(oldRef);
      assertReservation(oldReservation, session.organizationId, oldName, serviceTypeId);
      removeOldReservation = oldReservation.exists;
      const newReservation = await transaction.get(newRef);
      assertReservation(newReservation, session.organizationId, nameSearch);
      if (newReservation.exists) throw new ServiceTypeDuplicateNameError();
      const duplicates = await transaction.get(adminDb.collection("serviceTypes").where("organizationId", "==", session.organizationId).where("nameSearch", "==", nameSearch).limit(1));
      if (!duplicates.empty) throw new ServiceTypeDuplicateNameError();
    }
    const now = Timestamp.now();
    const nextVersion = version + 1;
    if (oldName !== nameSearch) {
      transaction.create(newRef, { organizationId: session.organizationId, nameSearch, serviceTypeId, createdAt: now });
      if (removeOldReservation) transaction.delete(oldRef);
    }
    transaction.update(reference, { ...values, nameSearch, version: nextVersion, updatedAt: now });
    transaction.create(auditRef, { organizationId: session.organizationId, actorUserId: session.uid, action: "SERVICE_TYPE_UPDATED", entityType: "SERVICE_TYPE", entityId: serviceTypeId, metadata: { changedFields, version: nextVersion }, createdAt: now });
    return { ...current, ...values, version: nextVersion, updatedAt: now.toDate().toISOString() };
  });
}
