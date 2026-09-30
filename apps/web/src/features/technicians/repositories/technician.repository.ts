import "server-only";

import { createHash } from "node:crypto";
import { FieldPath, Timestamp, type DocumentSnapshot, type Query, type Transaction } from "firebase-admin/firestore";
import { z } from "zod";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { hasPermission } from "@/src/lib/auth/permissions";
import { adminDb } from "@/src/lib/firebase/admin";
import {
  normalizeTechnicianName, technicianCreateSchema, technicianFormSchema, technicianIdSchema,
  technicianListFiltersSchema, technicianMemberFiltersSchema, technicianUpdateSchema,
  type TechnicianCreateInput, type TechnicianUpdateInput,
} from "../schemas/technician.schema";
import type { TechnicianDetail, TechnicianFormContext, TechnicianListData, TechnicianListFilters, TechnicianMemberOption } from "../types/technician";
import {
  TechnicianAccessError, TechnicianAlreadyLinkedError, TechnicianConflictError, TechnicianCursorError,
  TechnicianIneligibleMemberError, TechnicianNotFoundError,
} from "./technician-errors";

export const TECHNICIAN_PAGE_SIZE = 25;
const editableFields = ["displayName", "phone", "status"] as const;
const recordSchema = technicianFormSchema.extend({
  phone: technicianFormSchema.shape.phone.default(""),
  organizationId: technicianIdSchema,
  userId: technicianIdSchema,
  employeeNumber: z.string().regex(/^TEC-\d{6,}$/),
  nameSearch: z.string().min(1),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).passthrough();

function assertSession(session: AppSession) {
  if (!technicianIdSchema.safeParse(session.organizationId).success || !session.uid || !hasPermission(session.role, "manageTechnicians")) {
    throw new TechnicianAccessError();
  }
}

function timestampToIso(value: unknown): string {
  if (!(value instanceof Timestamp)) throw new Error("Invalid technician timestamp");
  return value.toDate().toISOString();
}

function toTechnician(snapshot: DocumentSnapshot, session: AppSession): TechnicianDetail {
  const value = snapshot.data();
  // Check ownership before parsing or exposing any data, including cursor records.
  if (!snapshot.exists || !value || value.organizationId !== session.organizationId) throw new TechnicianNotFoundError();
  const record = recordSchema.parse(value);
  if (!technicianIdSchema.safeParse(snapshot.id).success || record.nameSearch !== normalizeTechnicianName(record.displayName)) {
    throw new Error("Invalid technician identifier or search index");
  }
  return {
    id: snapshot.id,
    userId: record.userId,
    employeeNumber: record.employeeNumber,
    displayName: record.displayName,
    phone: record.phone,
    status: record.status,
    version: record.version,
    createdAt: timestampToIso(value.createdAt),
    updatedAt: timestampToIso(value.updatedAt),
  };
}

function memberUserId(snapshot: DocumentSnapshot, session: AppSession): string {
  const member = snapshot.data();
  if (!snapshot.exists || !member || member.organizationId !== session.organizationId ||
      !technicianIdSchema.safeParse(member.userId).success || snapshot.id !== `${session.organizationId}_${member.userId}` ||
      member.role !== "TECHNICIAN" || member.status !== "ACTIVE") {
    throw new TechnicianIneligibleMemberError();
  }
  return member.userId;
}

function eligibleUser(snapshot: DocumentSnapshot, userId: string): { displayName: string; email: string } {
  const user = snapshot.data();
  if (!snapshot.exists || snapshot.id !== userId || !user || user.isActive !== true ||
      typeof user.displayName !== "string" || !user.displayName.trim() || typeof user.email !== "string") {
    throw new TechnicianIneligibleMemberError();
  }
  return { displayName: user.displayName, email: user.email };
}

async function assertEligibleMember(transaction: Transaction, session: AppSession, userId: string) {
  const member = await transaction.get(adminDb.collection("memberships").doc(`${session.organizationId}_${userId}`));
  if (memberUserId(member, session) !== userId) throw new TechnicianIneligibleMemberError();
  // Global users are only resolved after proving their membership in this tenant.
  const user = await transaction.get(adminDb.collection("users").doc(userId));
  eligibleUser(user, userId);
}

function prefixUpperBound(prefix: string): string | undefined {
  const points = Array.from(prefix);
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index].codePointAt(0)!;
    if (point < 0x10ffff) return points.slice(0, index).join("") + String.fromCodePoint(point === 0xd7ff ? 0xe000 : point + 1);
  }
  return undefined;
}

export async function listTechnicians(session: AppSession, input: TechnicianListFilters): Promise<TechnicianListData> {
  assertSession(session);
  const filters = technicianListFiltersSchema.parse(input);
  const prefix = normalizeTechnicianName(filters.q);
  let query: Query = adminDb.collection("technicians").where("organizationId", "==", session.organizationId);
  if (filters.status !== "ALL") query = query.where("status", "==", filters.status);
  if (prefix) {
    query = query.where("nameSearch", ">=", prefix);
    const upperBound = prefixUpperBound(prefix);
    if (upperBound) query = query.where("nameSearch", "<", upperBound);
  }
  query = query.orderBy("nameSearch", "asc").orderBy(FieldPath.documentId(), "asc");
  if (filters.cursor) {
    const snapshot = await adminDb.collection("technicians").doc(filters.cursor).get();
    let cursor: TechnicianDetail;
    try { cursor = toTechnician(snapshot, session); } catch (error) {
      if (error instanceof TechnicianNotFoundError) throw new TechnicianCursorError();
      throw error;
    }
    if ((filters.status !== "ALL" && cursor.status !== filters.status) || !normalizeTechnicianName(cursor.displayName).startsWith(prefix)) {
      throw new TechnicianCursorError();
    }
    query = query.startAfter(snapshot);
  }
  const snapshot = await query.limit(TECHNICIAN_PAGE_SIZE + 1).get();
  const technicians = snapshot.docs.slice(0, TECHNICIAN_PAGE_SIZE).map((document) => toTechnician(document, session));
  return { technicians, filters, nextCursor: snapshot.docs.length > TECHNICIAN_PAGE_SIZE ? technicians[technicians.length - 1].id : null };
}

export async function readTechnician(session: AppSession, technicianId: string): Promise<TechnicianDetail> {
  assertSession(session);
  if (!technicianIdSchema.safeParse(technicianId).success) throw new TechnicianNotFoundError();
  return toTechnician(await adminDb.collection("technicians").doc(technicianId).get(), session);
}

export async function listTechnicianMembers(session: AppSession, input: { memberCursor?: string } = {}): Promise<TechnicianFormContext> {
  assertSession(session);
  const filters = technicianMemberFiltersSchema.parse(input);
  let query: Query = adminDb.collection("memberships")
    .where("organizationId", "==", session.organizationId).where("role", "==", "TECHNICIAN").where("status", "==", "ACTIVE")
    .orderBy(FieldPath.documentId(), "asc");
  if (filters.memberCursor) {
    const cursor = await adminDb.collection("memberships").doc(filters.memberCursor).get();
    try { memberUserId(cursor, session); } catch (error) {
      if (error instanceof TechnicianIneligibleMemberError) throw new TechnicianCursorError();
      throw error;
    }
    query = query.startAfter(cursor);
  }
  const snapshot = await query.limit(TECHNICIAN_PAGE_SIZE + 1).get();
  const page = snapshot.docs.slice(0, TECHNICIAN_PAGE_SIZE);
  const options = await Promise.all(page.map(async (member): Promise<TechnicianMemberOption | null> => {
    let userId: string;
    try { userId = memberUserId(member, session); } catch (error) {
      if (error instanceof TechnicianIneligibleMemberError) return null;
      throw error;
    }
    const user = await adminDb.collection("users").doc(userId).get();
    let profile: { displayName: string; email: string };
    try { profile = eligibleUser(user, userId); } catch (error) {
      if (error instanceof TechnicianIneligibleMemberError) return null;
      throw error;
    }
    const linked = await adminDb.collection("technicians").where("organizationId", "==", session.organizationId).where("userId", "==", userId).limit(2).get();
    if (linked.docs.some((document) => document.data().organizationId !== session.organizationId || document.data().userId !== userId)) {
      throw new Error("Invalid technician membership relation");
    }
    return { userId, ...profile, linked: !linked.empty };
  }));
  return {
    members: options.filter((member): member is TechnicianMemberOption => member !== null),
    memberCursor: filters.memberCursor,
    nextMemberCursor: snapshot.docs.length > TECHNICIAN_PAGE_SIZE ? page[page.length - 1].id : null,
  };
}

export async function createTechnician(session: AppSession, input: TechnicianCreateInput): Promise<TechnicianDetail> {
  assertSession(session);
  const { requestId, userId, ...values } = technicianCreateSchema.parse(input);
  const profileKey = createHash("sha256").update(JSON.stringify([session.organizationId, userId])).digest("hex");
  const requestKey = createHash("sha256").update(JSON.stringify([session.organizationId, session.uid, requestId])).digest("hex");
  const payloadHash = createHash("sha256").update(JSON.stringify({ userId, ...values })).digest("hex");
  const technicianRef = adminDb.collection("technicians").doc(`tech_${profileKey}`);
  const requestRef = adminDb.collection("technicianCreateRequests").doc(requestKey);
  const counterRef = adminDb.collection("technicianCounters").doc(session.organizationId);
  const auditRef = adminDb.collection("auditLogs").doc();

  return adminDb.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    const existing = await transaction.get(technicianRef);
    if (requestSnapshot.exists) {
      const receipt = requestSnapshot.data()!;
      if (receipt.organizationId !== session.organizationId || receipt.actorUserId !== session.uid ||
          receipt.technicianId !== technicianRef.id || receipt.payloadHash !== payloadHash) throw new TechnicianConflictError();
      const technician = toTechnician(existing, session);
      if (technician.userId !== userId) throw new TechnicianConflictError();
      return technician;
    }
    if (existing.exists) {
      toTechnician(existing, session);
      throw new TechnicianAlreadyLinkedError();
    }
    // A completed request can be replayed after access changes, but a new
    // profile must still pass the current membership and account checks.
    await assertEligibleMember(transaction, session, userId);
    // Catch legacy profiles too; the deterministic reference serializes new creations.
    const duplicates = await transaction.get(adminDb.collection("technicians").where("organizationId", "==", session.organizationId).where("userId", "==", userId).limit(2));
    if (!duplicates.empty) throw new TechnicianAlreadyLinkedError();
    const counterSnapshot = await transaction.get(counterRef);
    const counter = counterSnapshot.data();
    if (counterSnapshot.exists && (counterSnapshot.id !== session.organizationId || counter?.organizationId !== session.organizationId ||
        !Number.isSafeInteger(counter.lastNumber) || counter.lastNumber < 0)) throw new Error("Invalid technician counter ownership or sequence");
    if (!counterSnapshot.exists) {
      const existingTechnicians = await transaction.get(adminDb.collection("technicians").where("organizationId", "==", session.organizationId).limit(1));
      if (!existingTechnicians.empty) throw new Error("Existing technicians require counter migration");
    }
    const nextNumber: number = (counter?.lastNumber ?? 0) + 1;
    if (!Number.isSafeInteger(nextNumber)) throw new Error("Technician sequence exhausted");
    const employeeNumber = `TEC-${String(nextNumber).padStart(6, "0")}`;
    const numberCollision = await transaction.get(adminDb.collection("technicians").where("organizationId", "==", session.organizationId).where("employeeNumber", "==", employeeNumber).limit(1));
    if (!numberCollision.empty) throw new Error("Technician counter requires reconciliation");
    const now = Timestamp.now();
    transaction.create(technicianRef, {
      ...values, userId, organizationId: session.organizationId, employeeNumber,
      nameSearch: normalizeTechnicianName(values.displayName), version: 1,
      createdAt: now, updatedAt: now, createdBy: session.uid,
    });
    transaction.create(requestRef, { organizationId: session.organizationId, actorUserId: session.uid, technicianId: technicianRef.id, payloadHash, createdAt: now });
    transaction.set(counterRef, { organizationId: session.organizationId, lastNumber: nextNumber, updatedAt: now }, { merge: true });
    transaction.create(auditRef, {
      organizationId: session.organizationId, actorUserId: session.uid,
      action: "TECHNICIAN_CREATED", entityType: "TECHNICIAN", entityId: technicianRef.id,
      metadata: { employeeNumber, userId }, createdAt: now,
    });
    return { ...values, userId, id: technicianRef.id, employeeNumber, version: 1, createdAt: now.toDate().toISOString(), updatedAt: now.toDate().toISOString() };
  });
}

export async function updateTechnician(session: AppSession, technicianId: string, input: TechnicianUpdateInput): Promise<TechnicianDetail> {
  assertSession(session);
  if (!technicianIdSchema.safeParse(technicianId).success) throw new TechnicianNotFoundError();
  const { version, ...values } = technicianUpdateSchema.parse(input);
  const technicianRef = adminDb.collection("technicians").doc(technicianId);
  const auditRef = adminDb.collection("auditLogs").doc();

  return adminDb.runTransaction(async (transaction) => {
    const current = toTechnician(await transaction.get(technicianRef), session);
    if (current.version !== version) throw new TechnicianConflictError();
    // Suspended members can still have a profile marked inactive for cleanup.
    if (values.status !== "INACTIVE") await assertEligibleMember(transaction, session, current.userId);
    const changedFields = editableFields.filter((field) => current[field] !== values[field]);
    if (!changedFields.length) return current;
    const now = Timestamp.now();
    const nextVersion = version + 1;
    transaction.update(technicianRef, { ...values, nameSearch: normalizeTechnicianName(values.displayName), version: nextVersion, updatedAt: now });
    transaction.create(auditRef, {
      organizationId: session.organizationId, actorUserId: session.uid,
      action: "TECHNICIAN_UPDATED", entityType: "TECHNICIAN", entityId: technicianId,
      metadata: { changedFields, version: nextVersion }, createdAt: now,
    });
    return { ...current, ...values, version: nextVersion, updatedAt: now.toDate().toISOString() };
  });
}
