import "server-only";
import { createHash } from "node:crypto";
import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";

import { findTechnicianMove, isTechnicianDecline, technicianMoves } from "@/../../packages/domain/src/job-technician-moves";
import type { AppSession } from "@/src/features/auth/types/app-session";
import { parseJobSnapshot } from "@/src/features/jobs/repositories/job.repository";
import { JobNotFoundError } from "@/src/features/jobs/repositories/job-errors";
import { jobIdSchema, jobNoteSchema, jobStatusSchema, type JobNoteInput } from "@/src/features/jobs/schemas/job.schema";
import type { JobDetail, JobStatus } from "@/src/features/jobs/types/job";
import { adminDb } from "@/src/lib/firebase/admin";
import { mobileJobMoveSchema, type MobileJobMoveRequest } from "../schemas/mobile-jobs.schema";
import type { MobileJobDetail, MobileJobEvent, MobileJobList, MobileJobNote, MobileJobSummary } from "../types/mobile-jobs";
import type { MobileTechnician } from "../types/mobile-session";

/** Jobs a technician still works on or waits on: Assigned through On hold, plus Rescheduled ones the office is changing. */
export const MOBILE_OPEN_STATUSES = [
  "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "DIAGNOSING", "QUOTATION_REQUIRED", "WAITING_APPROVAL", "APPROVED", "IN_PROGRESS", "ON_HOLD", "RESCHEDULED",
] as const satisfies readonly JobStatus[];
const FINISHED_STATUSES: readonly JobStatus[] = ["COMPLETED", "INVOICED", "PARTIAL", "PAID", "CLOSED"];
const ENDED_WITHOUT_WORK: readonly JobStatus[] = ["CANCELLED", "REJECTED"];
export const MOBILE_OPEN_JOB_LIMIT = 100;
export const MOBILE_DONE_DAYS = 7;
const DONE_LIMIT = 30;
const NOTE_LIMIT = 50;
const HISTORY_LIMIT = 20;

/** The job doesn't exist, belongs to another workspace, or isn't assigned to this technician. */
export class MobileJobNotFoundError extends Error {}
/** The job changed since the app loaded it, or a request ID was reused for something else. */
export class MobileJobConflictError extends Error {}
/** The job's status doesn't allow this move or note. */
export class MobileJobStateError extends Error {}
/** The move needs a reason. */
export class MobileJobReasonError extends Error {}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const isOpen = (status: JobStatus) => (MOBILE_OPEN_STATUSES as readonly JobStatus[]).includes(status);
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

function iso(value: unknown): string {
  if (!(value instanceof Timestamp)) throw new Error("Invalid job timestamp");
  return value.toDate().toISOString();
}

/** The job, only if it is in this workspace and assigned to this technician. */
function assignedJob(snapshot: DocumentSnapshot, session: AppSession, technician: MobileTechnician): JobDetail {
  let job: JobDetail;
  try {
    job = parseJobSnapshot(snapshot, session);
  } catch (error) {
    if (error instanceof JobNotFoundError) throw new MobileJobNotFoundError();
    throw error;
  }
  if (job.assignedTechnicianId !== technician.id) throw new MobileJobNotFoundError();
  return job;
}

function summary(job: JobDetail): MobileJobSummary {
  return {
    id: job.id, jobNumber: job.jobNumber, title: job.title, status: job.status, priority: job.priority,
    scheduledAt: job.scheduledAt, estimatedDurationMinutes: job.estimatedDurationMinutes,
    customerName: job.customerName, serviceAddress: job.serviceAddress, serviceTypeName: job.serviceTypeName,
    completedAt: job.completedAt, updatedAt: job.updatedAt, version: job.version,
  };
}

/** Visit time first, jobs without a time last. */
function byVisit(a: MobileJobSummary, b: MobileJobSummary) {
  if (a.scheduledAt !== b.scheduledAt) {
    if (a.scheduledAt === null) return 1;
    if (b.scheduledAt === null) return -1;
    return a.scheduledAt < b.scheduledAt ? -1 : 1;
  }
  return a.jobNumber < b.jobNumber ? -1 : a.jobNumber > b.jobNumber ? 1 : 0;
}

/** The technician's open jobs and those completed in the last 7 days. */
export async function listTechnicianJobs(session: AppSession, technician: MobileTechnician, now = new Date()): Promise<MobileJobList> {
  const jobs = adminDb.collection("jobs").where("organizationId", "==", session.organizationId).where("assignedTechnicianId", "==", technician.id);
  const since = new Date(now.getTime() - MOBILE_DONE_DAYS * 24 * 60 * 60 * 1000);
  const [open, done] = await Promise.all([
    jobs.where("status", "in", [...MOBILE_OPEN_STATUSES]).limit(MOBILE_OPEN_JOB_LIMIT + 1).get(),
    jobs.where("completedAt", ">=", since).orderBy("completedAt", "desc").limit(DONE_LIMIT).get(),
  ]);
  const read = (snapshot: DocumentSnapshot) => summary(assignedJob(snapshot, session, technician));
  return {
    open: open.docs.slice(0, MOBILE_OPEN_JOB_LIMIT).map(read).sort(byVisit),
    done: done.docs.map(read).filter((job) => FINISHED_STATUSES.includes(job.status)),
    truncated: open.docs.length > MOBILE_OPEN_JOB_LIMIT,
    generatedAt: now.toISOString(),
  };
}

async function customerPhone(session: AppSession, customerId: string): Promise<string | null> {
  const snapshot = await adminDb.collection("customers").doc(customerId).get();
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId) return null;
  return text(data.phone)?.trim() ?? null;
}

function toNote(id: string, data: Record<string, unknown>, session: AppSession): MobileJobNote {
  return { id, body: String(data.body ?? ""), authorName: String(data.authorName ?? ""), mine: data.authorUserId === session.uid, createdAt: iso(data.createdAt) };
}

async function listNotes(session: AppSession, jobId: string): Promise<MobileJobNote[]> {
  const snapshot = await adminDb.collection("jobNotes").where("organizationId", "==", session.organizationId).where("jobId", "==", jobId)
    .orderBy("createdAt", "desc").limit(NOTE_LIMIT).get();
  return snapshot.docs.map((document) => {
    const data = document.data();
    if (data.organizationId !== session.organizationId || data.jobId !== jobId) throw new Error("Invalid job note tenant");
    return toNote(document.id, data, session);
  });
}

/** Status changes from the job's activity log: the technician's own, the office's and billing's. */
async function listHistory(session: AppSession, jobId: string): Promise<MobileJobEvent[]> {
  const snapshot = await adminDb.collection("auditLogs").where("organizationId", "==", session.organizationId).where("entityType", "==", "JOB")
    .where("entityId", "==", jobId).orderBy("createdAt", "desc").limit(HISTORY_LIMIT).get();
  return snapshot.docs.flatMap((document): MobileJobEvent[] => {
    const data = document.data();
    if (data.organizationId !== session.organizationId || data.entityId !== jobId) throw new Error("Invalid job activity tenant");
    if (!["JOB_STATUS_CHANGED", "JOB_DECLINED", "JOB_DISPATCHED"].includes(data.action)) return [];
    const meta: Record<string, unknown> = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
    const to = jobStatusSchema.safeParse(meta.to);
    const from = jobStatusSchema.safeParse(meta.from);
    // A dispatch that only changed the visit time isn't a status change.
    if (!to.success || (data.action === "JOB_DISPATCHED" && from.success && from.data === to.data)) return [];
    const app = meta.source === "MOBILE";
    return [{
      id: document.id, at: iso(data.createdAt), from: from.success ? from.data : null, to: to.data,
      note: text(meta.reason) ?? text(meta.note), technicianName: app ? text(meta.actorName) : null, declined: data.action === "JOB_DECLINED",
    }];
  });
}

/** One of the technician's jobs, with what the app shows on the job screen. */
export async function readTechnicianJob(session: AppSession, technician: MobileTechnician, jobId: string): Promise<MobileJobDetail> {
  if (!jobIdSchema.safeParse(jobId).success) throw new MobileJobNotFoundError();
  const job = assignedJob(await adminDb.collection("jobs").doc(jobId).get(), session, technician);
  const [phone, notes, history] = await Promise.all([
    isOpen(job.status) ? customerPhone(session, job.customerId) : Promise.resolve(null),
    listNotes(session, job.id),
    listHistory(session, job.id),
  ]);
  return {
    ...summary(job),
    description: job.description,
    customerNumber: job.customerNumber,
    customerPhone: phone,
    notes,
    history,
    moves: technicianMoves(job.status).map((move) => ({ to: move.to, input: move.input })),
    canAddNote: !ENDED_WITHOUT_WORK.includes(job.status),
  };
}

/**
 * Apply a status move from the app. The request ID makes retries safe: the
 * audit entry's ID is derived from it, so a repeat finds the saved move and
 * answers as the first request did. A decline sends the job back to the office
 * as Rescheduled without a technician; the visit time is kept.
 */
export async function moveTechnicianJob(session: AppSession, technician: MobileTechnician, jobId: string, input: MobileJobMoveRequest): Promise<{ job: MobileJobDetail | null }> {
  if (!jobIdSchema.safeParse(jobId).success) throw new MobileJobNotFoundError();
  const { to, version, requestId, reason, note } = mobileJobMoveSchema.parse(input);
  const jobRef = adminDb.collection("jobs").doc(jobId);
  const auditRef = adminDb.collection("auditLogs").doc(`mobile_${hash([session.organizationId, session.uid, "job-move", requestId])}`);
  const outcome = await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const saved = await transaction.get(auditRef);
    if (saved.exists) {
      const data = saved.data()!;
      if (data.organizationId !== session.organizationId || data.actorUserId !== session.uid || data.entityId !== jobId || data.metadata?.to !== to) {
        throw new MobileJobConflictError();
      }
      return { declined: data.action === "JOB_DECLINED" };
    }
    const job = assignedJob(snapshot, session, technician);
    if (job.version !== version) throw new MobileJobConflictError();
    const move = findTechnicianMove(job.status, to);
    if (!move) throw new MobileJobStateError();
    const why = move.input === "reason" ? text(reason) : text(note);
    if (move.input === "reason" && !why) throw new MobileJobReasonError();
    const declined = isTechnicianDecline(move);
    const now = Timestamp.now();
    transaction.update(jobRef, {
      status: to, version: version + 1, updatedAt: now,
      ...(to === "COMPLETED" ? { completedAt: now } : {}),
      ...(declined ? { assignedTechnicianId: null, assignedTechnicianName: null } : {}),
    });
    transaction.create(auditRef, {
      organizationId: session.organizationId, actorUserId: session.uid, entityType: "JOB", entityId: jobId,
      action: declined ? "JOB_DECLINED" : "JOB_STATUS_CHANGED",
      metadata: {
        from: job.status, to, version: version + 1, source: "MOBILE", technicianId: technician.id, actorName: technician.displayName,
        ...(why ? (declined ? { reason: why } : { note: why }) : {}),
      },
      createdAt: now,
    });
    return { declined };
  });
  // A declined job is no longer the technician's to see.
  if (outcome.declined) return { job: null };
  return { job: await readTechnicianJob(session, technician, jobId) };
}

/** Add a note from the app to the job's notes, shared with the office's job page. Safe to retry with the same request ID. */
export async function addTechnicianJobNote(session: AppSession, technician: MobileTechnician, jobId: string, input: JobNoteInput): Promise<MobileJobNote> {
  if (!jobIdSchema.safeParse(jobId).success) throw new MobileJobNotFoundError();
  const { body, requestId } = jobNoteSchema.parse(input);
  // Same ID scheme as notes written on the web.
  const noteRef = adminDb.collection("jobNotes").doc(`note_${hash([session.organizationId, session.uid, requestId])}`);
  return adminDb.runTransaction(async (transaction) => {
    const job = assignedJob(await transaction.get(adminDb.collection("jobs").doc(jobId)), session, technician);
    const existing = await transaction.get(noteRef);
    if (existing.exists) {
      const data = existing.data()!;
      if (data.organizationId !== session.organizationId || data.jobId !== job.id || data.authorUserId !== session.uid) throw new MobileJobConflictError();
      return toNote(existing.id, data, session);
    }
    if (ENDED_WITHOUT_WORK.includes(job.status)) throw new MobileJobStateError();
    const now = Timestamp.now();
    transaction.create(noteRef, {
      organizationId: session.organizationId, jobId: job.id, body, authorUserId: session.uid, authorName: technician.displayName, source: "MOBILE", createdAt: now,
    });
    return { id: noteRef.id, body, authorName: technician.displayName, mine: true, createdAt: now.toDate().toISOString() };
  });
}
