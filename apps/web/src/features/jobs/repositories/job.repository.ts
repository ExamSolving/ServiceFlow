import "server-only";
import { createHash } from "node:crypto";
import { FieldPath, Timestamp, type DocumentSnapshot, type Query, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/src/lib/firebase/admin";
import { hasPermission } from "@/src/lib/auth/permissions";
import type { AppSession } from "@/src/features/auth/types/app-session";
import { serviceRequestFormSchema } from "@/src/features/service-requests/schemas/service-request.schema";
import { canEditServiceRequest } from "@/src/features/service-requests/utils/request-workflow";
import { organizationSettingsRecordSchema } from "@/src/features/organization-settings/schemas/organization-settings.schema";
import { normalizeTechnicianName, technicianStatusSchema } from "@/src/features/technicians/schemas/technician.schema";
import {
  jobCancelSchema, jobConvertSchema, jobCreateSchema, jobDetailSchema, jobDispatchSchema, jobIdSchema, jobListFiltersSchema, jobNoteSchema,
  jobTransitionSchema, jobUpdateSchema, normalizeJobTitle, technicianOptionsSchema,
  type JobCancelInput, type JobConvertInput, type JobCreateInput, type JobDispatchInput, type JobNoteInput, type JobTransitionInput,
  type JobUpdateInput, type TechnicianOptionsInput,
} from "../schemas/job.schema";
import type { JobActivity, JobDetail, JobFormValues, JobListData, JobListFilters, JobNote, JobStatus, TechnicianOption, TechnicianOptions } from "../types/job";
import { canCancelJob, canDispatchJob, canEditJob, canTransitionJob, webJobTransitions } from "../utils/job-workflow";
import { JobAccessError, JobConflictError, JobCursorError, JobNotFoundError, JobReferenceError, JobStateError } from "./job-errors";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fields = ["customerId", "serviceTypeId", "title", "description", "priority", "serviceAddress"] as const;
export const JOB_PAGE_SIZE = 25;
export const TECHNICIAN_OPTION_PAGE_SIZE = 10;
const SCHEDULE_LIMIT = 200;
const ACTIVE_TECHNICIAN_STATUSES = ["AVAILABLE", "BUSY", "OFFLINE", "ON_LEAVE"] as const;

function authorize(session: AppSession) {
  if (!jobIdSchema.safeParse(session.uid).success || !jobIdSchema.safeParse(session.organizationId).success || !hasPermission(session.role, "dispatchJobs")) throw new JobAccessError();
}
function iso(value: unknown) {
  if (!(value instanceof Timestamp)) throw new Error("Invalid job timestamp");
  return value.toDate().toISOString();
}
function optionalIso(value: unknown) {
  return value == null ? null : iso(value);
}
function owned(snapshot: DocumentSnapshot, session: AppSession) {
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId) throw new JobNotFoundError();
  return data;
}
function detail(snapshot: DocumentSnapshot, session: AppSession): JobDetail {
  const data = owned(snapshot, session);
  // Strip server-only persistence fields before returning the public DTO.
  const parsed = jobDetailSchema.strip().parse({
    ...data, id: snapshot.id, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt), scheduledAt: optionalIso(data.scheduledAt),
    completedAt: optionalIso(data.completedAt), assignedTechnicianId: data.assignedTechnicianId ?? null, assignedTechnicianName: data.assignedTechnicianName ?? null,
    estimatedDurationMinutes: data.estimatedDurationMinutes ?? null,
  });
  if (data.titleSearch !== normalizeJobTitle(parsed.title)) throw new Error("Invalid job search index");
  return parsed;
}
function audit(transaction: Transaction, session: AppSession, id: string, action: string, metadata: Record<string, unknown>, now: Timestamp) {
  transaction.create(adminDb.collection("auditLogs").doc(), { organizationId: session.organizationId, actorUserId: session.uid, entityType: "JOB", entityId: id, action, metadata, createdAt: now });
}
async function references(transaction: Transaction, session: AppSession, values: JobFormValues, current?: JobDetail) {
  const customer = await transaction.get(adminDb.collection("customers").doc(values.customerId));
  const service = await transaction.get(adminDb.collection("serviceTypes").doc(values.serviceTypeId));
  const c = customer.data(), s = service.data();
  if (!c || c.organizationId !== session.organizationId || (c.isActive !== true && values.customerId !== current?.customerId) ||
      typeof c.name !== "string" || !c.name.trim() || typeof c.customerNumber !== "string" || !c.customerNumber) throw new JobReferenceError();
  if (!s || s.organizationId !== session.organizationId || (s.isActive !== true && values.serviceTypeId !== current?.serviceTypeId) || typeof s.name !== "string" || !s.name.trim()) throw new JobReferenceError();
  const duration = typeof s.estimatedDurationMinutes === "number" && Number.isInteger(s.estimatedDurationMinutes) && s.estimatedDurationMinutes > 0 ? s.estimatedDurationMinutes : null;
  return {
    customerName: current?.customerId === values.customerId ? current.customerName : c.name,
    customerNumber: current?.customerId === values.customerId ? current.customerNumber : c.customerNumber,
    serviceTypeName: current?.serviceTypeId === values.serviceTypeId ? current.serviceTypeName : s.name,
    estimatedDurationMinutes: current && current.serviceTypeId === values.serviceTypeId ? current.estimatedDurationMinutes : duration,
  };
}
async function numberContext(transaction: Transaction, session: AppSession) {
  const counterRef = adminDb.collection("jobCounters").doc(session.organizationId);
  const counter = await transaction.get(counterRef);
  const settings = await transaction.get(adminDb.collection("organizationSettings").doc(session.organizationId));
  const config = settings.data();
  if (config && config.organizationId !== session.organizationId) throw new Error("Invalid job settings ownership");
  const prefix = organizationSettingsRecordSchema.shape.jobNumberPrefix.parse(config?.jobNumberPrefix ?? "JOB");
  const data = counter.data();
  if (counter.exists && (!data || data.organizationId !== session.organizationId || !Number.isSafeInteger(data.lastNumber) || data.lastNumber < 0)) throw new Error("Invalid job counter");
  if (!counter.exists) {
    const legacy = await transaction.get(adminDb.collection("jobs").where("organizationId", "==", session.organizationId).limit(1));
    if (!legacy.empty) throw new Error("Existing jobs require counter migration");
  }
  const nextNumber = (data?.lastNumber ?? 0) + 1;
  if (!Number.isSafeInteger(nextNumber)) throw new Error("Job sequence exhausted");
  const jobNumber = `${prefix}-${String(nextNumber).padStart(6, "0")}`;
  const duplicate = await transaction.get(adminDb.collection("jobs").where("organizationId", "==", session.organizationId).where("jobNumber", "==", jobNumber).limit(1));
  if (!duplicate.empty) throw new Error("Job number already allocated");
  return { counterRef, nextNumber, jobNumber };
}
async function insert(transaction: Transaction, session: AppSession, id: string, values: JobFormValues, creation: Record<string, unknown>, sourceId: string | null): Promise<JobDetail> {
  const names = await references(transaction, session, values);
  const numbering = await numberContext(transaction, session);
  const now = Timestamp.now();
  const record = { ...values, ...names, jobNumber: numbering.jobNumber, serviceRequestId: sourceId, status: "NEW" as const, assignedTechnicianId: null, assignedTechnicianName: null, scheduledAt: null, completedAt: null, version: 1 };
  transaction.create(adminDb.collection("jobs").doc(id), { ...record, ...creation, organizationId: session.organizationId, titleSearch: normalizeJobTitle(values.title), createdBy: session.uid, createdAt: now, updatedAt: now });
  transaction.set(numbering.counterRef, { organizationId: session.organizationId, lastNumber: numbering.nextNumber, updatedAt: now });
  audit(transaction, session, id, "JOB_CREATED", { jobNumber: record.jobNumber, serviceRequestId: sourceId, version: 1 }, now);
  return { ...record, id, createdAt: now.toDate().toISOString(), updatedAt: now.toDate().toISOString() };
}

export async function createJob(session: AppSession, input: JobCreateInput) {
  authorize(session);
  const { requestId, ...values } = jobCreateSchema.parse(input);
  const key = hash([session.organizationId, session.uid, requestId]);
  const creationPayloadHash = hash(values);
  const ref = adminDb.collection("jobs").doc(`job_${key}`);
  return adminDb.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const job = detail(existing, session), data = existing.data()!;
      if (data.createdBy !== session.uid || data.creationKey !== key || data.creationPayloadHash !== creationPayloadHash) throw new JobConflictError();
      return job;
    }
    return insert(transaction, session, ref.id, values, { creationKey: key, creationPayloadHash }, null);
  });
}

export async function convertRequestToJob(session: AppSession, input: JobConvertInput) {
  authorize(session);
  const values = jobConvertSchema.parse(input);
  const sourceRef = adminDb.collection("serviceRequests").doc(values.serviceRequestId);
  const jobRef = adminDb.collection("jobs").doc(`job_${hash([session.organizationId, "request", values.serviceRequestId])}`);
  return adminDb.runTransaction(async transaction => {
    const sourceSnapshot = await transaction.get(sourceRef);
    const source = owned(sourceSnapshot, session);
    const existing = await transaction.get(jobRef);
    if (existing.exists) {
      const job = detail(existing, session);
      if (job.serviceRequestId !== values.serviceRequestId || source.convertedJobId !== job.id || source.status !== "CONVERTED_TO_JOB" || existing.data()?.conversionHash !== hash(values)) throw new JobConflictError();
      return job;
    }
    if (source.version !== values.version || source.convertedJobId) throw new JobConflictError();
    if (!canEditServiceRequest(source.status)) throw new JobStateError();
    const duplicates = await transaction.get(adminDb.collection("jobs").where("organizationId", "==", session.organizationId).where("serviceRequestId", "==", values.serviceRequestId).limit(1));
    if (!duplicates.empty) throw new JobConflictError();
    const base = serviceRequestFormSchema.parse(Object.fromEntries(["customerId", "serviceTypeId", "title", "description", "priority"].map(field => [field, source[field]])));
    const job = await insert(transaction, session, jobRef.id, { ...base, serviceAddress: values.serviceAddress }, { conversionHash: hash(values) }, sourceRef.id);
    const now = Timestamp.fromDate(new Date(job.createdAt));
    transaction.update(sourceRef, { status: "CONVERTED_TO_JOB", convertedJobId: job.id, version: values.version + 1, updatedAt: now });
    transaction.create(adminDb.collection("auditLogs").doc(), { organizationId: session.organizationId, actorUserId: session.uid, action: "SERVICE_REQUEST_STATUS_CHANGED", entityType: "SERVICE_REQUEST", entityId: sourceRef.id, metadata: { from: source.status, to: "CONVERTED_TO_JOB", jobId: job.id, version: values.version + 1 }, createdAt: now });
    return job;
  });
}
export async function readJob(session: AppSession, id: string) {
  authorize(session);
  if (!jobIdSchema.safeParse(id).success) throw new JobNotFoundError();
  return detail(await adminDb.collection("jobs").doc(id).get(), session);
}
export async function updateJob(session: AppSession, id: string, input: JobUpdateInput) {
  authorize(session);
  if (!jobIdSchema.safeParse(id).success) throw new JobNotFoundError();
  const { version, ...values } = jobUpdateSchema.parse(input);
  const ref = adminDb.collection("jobs").doc(id);
  return adminDb.runTransaction(async transaction => {
    const current = detail(await transaction.get(ref), session);
    if (current.version !== version) throw new JobConflictError();
    if (!canEditJob(current.status)) throw new JobStateError();
    if (current.serviceRequestId && (current.customerId !== values.customerId || current.serviceTypeId !== values.serviceTypeId)) throw new JobReferenceError();
    const names = await references(transaction, session, values, current);
    const changedFields = fields.filter(field => values[field] !== current[field]);
    if (!changedFields.length) return current;
    const now = Timestamp.now();
    transaction.update(ref, { ...values, ...names, titleSearch: normalizeJobTitle(values.title), version: version + 1, updatedAt: now });
    audit(transaction, session, id, "JOB_UPDATED", { changedFields, version: version + 1 }, now);
    return { ...current, ...values, ...names, version: version + 1, updatedAt: now.toDate().toISOString() };
  });
}
export async function cancelJob(session: AppSession, id: string, input: JobCancelInput) {
  authorize(session);
  if (!jobIdSchema.safeParse(id).success) throw new JobNotFoundError();
  const { version } = jobCancelSchema.parse(input);
  const ref = adminDb.collection("jobs").doc(id);
  return adminDb.runTransaction(async transaction => {
    const current = detail(await transaction.get(ref), session);
    if (current.version !== version) throw new JobConflictError();
    if (!canCancelJob(current.status)) throw new JobStateError();
    const now = Timestamp.now();
    transaction.update(ref, { status: "CANCELLED", version: version + 1, updatedAt: now });
    audit(transaction, session, id, "JOB_STATUS_CHANGED", { from: current.status, to: "CANCELLED", version: version + 1 }, now);
    return { ...current, status: "CANCELLED" as const, version: version + 1, updatedAt: now.toDate().toISOString() };
  });
}

/** Move a job along the domain state machine; billing statuses are excluded by the schema. */
export async function transitionJob(session: AppSession, id: string, input: JobTransitionInput) {
  authorize(session);
  if (!jobIdSchema.safeParse(id).success) throw new JobNotFoundError();
  const { to, version, note } = jobTransitionSchema.parse(input);
  const ref = adminDb.collection("jobs").doc(id);
  return adminDb.runTransaction(async transaction => {
    const current = detail(await transaction.get(ref), session);
    if (current.version !== version) throw new JobConflictError();
    if (!webJobTransitions(current.status).includes(to)) throw new JobStateError();
    // Field work needs someone assigned to it.
    if (["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(to) && !current.assignedTechnicianId) throw new JobStateError();
    const now = Timestamp.now();
    const completedAt = to === "COMPLETED" ? now : null;
    transaction.update(ref, { status: to, version: version + 1, updatedAt: now, ...(to === "COMPLETED" ? { completedAt: now } : {}) });
    audit(transaction, session, id, "JOB_STATUS_CHANGED", { from: current.status, to, version: version + 1, ...(note ? { note } : {}) }, now);
    return { ...current, status: to, version: version + 1, updatedAt: now.toDate().toISOString(), completedAt: completedAt ? completedAt.toDate().toISOString() : current.completedAt };
  });
}

function activeTechnician(snapshot: DocumentSnapshot, session: AppSession) {
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId || typeof data.displayName !== "string" || !data.displayName.trim()) throw new JobReferenceError();
  const status = technicianStatusSchema.safeParse(data.status);
  if (!status.success || status.data === "INACTIVE") throw new JobReferenceError();
  return { id: snapshot.id, displayName: data.displayName, status: status.data };
}

/** Assign a technician and optionally set the visit time, following the state machine. */
export async function dispatchJob(session: AppSession, id: string, input: JobDispatchInput) {
  authorize(session);
  if (!jobIdSchema.safeParse(id).success) throw new JobNotFoundError();
  const { technicianId, scheduledAt, version } = jobDispatchSchema.parse(input);
  const ref = adminDb.collection("jobs").doc(id);
  return adminDb.runTransaction(async transaction => {
    const current = detail(await transaction.get(ref), session);
    if (current.version !== version) throw new JobConflictError();
    if (!canDispatchJob(current.status)) throw new JobStateError();
    const technician = activeTechnician(await transaction.get(adminDb.collection("technicians").doc(technicianId)), session);
    const scheduled = scheduledAt ? Timestamp.fromDate(new Date(scheduledAt)) : null;
    const unchanged = current.assignedTechnicianId === technician.id && current.scheduledAt === (scheduled ? scheduled.toDate().toISOString() : null);
    if (unchanged && current.status !== "NEW" && current.status !== "RESCHEDULED") return current;
    // An accepted job that changes hands or moves goes through RESCHEDULED before it is ASSIGNED again.
    const path: JobStatus[] = current.status === "NEW" ? ["ASSIGNED"] : current.status === "ACCEPTED" ? ["RESCHEDULED", "ASSIGNED"] : current.status === "RESCHEDULED" ? ["ASSIGNED"] : [];
    let status: JobStatus = current.status;
    for (const step of path) { if (!canTransitionJob(status, step)) throw new JobStateError(); status = step; }
    const now = Timestamp.now();
    transaction.update(ref, { assignedTechnicianId: technician.id, assignedTechnicianName: technician.displayName, scheduledAt: scheduled, status, version: version + 1, updatedAt: now });
    audit(transaction, session, id, "JOB_DISPATCHED", {
      technicianId: technician.id, scheduledAt: scheduled ? scheduled.toDate().toISOString() : null, from: current.status, to: status, path, version: version + 1,
    }, now);
    return { ...current, assignedTechnicianId: technician.id, assignedTechnicianName: technician.displayName, scheduledAt: scheduled ? scheduled.toDate().toISOString() : null, status, version: version + 1, updatedAt: now.toDate().toISOString() };
  });
}

export async function addJobNote(session: AppSession, jobId: string, input: JobNoteInput): Promise<JobNote> {
  authorize(session);
  if (!jobIdSchema.safeParse(jobId).success) throw new JobNotFoundError();
  const { body, requestId } = jobNoteSchema.parse(input);
  const noteRef = adminDb.collection("jobNotes").doc(`note_${hash([session.organizationId, session.uid, requestId])}`);
  return adminDb.runTransaction(async transaction => {
    const job = detail(await transaction.get(adminDb.collection("jobs").doc(jobId)), session);
    const existing = await transaction.get(noteRef);
    if (existing.exists) {
      const data = existing.data()!;
      if (data.organizationId !== session.organizationId || data.jobId !== job.id || data.authorUserId !== session.uid) throw new JobConflictError();
      return { id: existing.id, body: data.body, authorUserId: data.authorUserId, authorName: data.authorName ?? "", createdAt: iso(data.createdAt) };
    }
    const now = Timestamp.now();
    transaction.create(noteRef, { organizationId: session.organizationId, jobId: job.id, body, authorUserId: session.uid, authorName: session.displayName, createdAt: now });
    return { id: noteRef.id, body, authorUserId: session.uid, authorName: session.displayName, createdAt: now.toDate().toISOString() };
  });
}

export async function listJobNotes(session: AppSession, jobId: string): Promise<JobNote[]> {
  authorize(session);
  if (!jobIdSchema.safeParse(jobId).success) throw new JobNotFoundError();
  const snapshot = await adminDb.collection("jobNotes").where("organizationId", "==", session.organizationId).where("jobId", "==", jobId).orderBy("createdAt", "desc").limit(50).get();
  return snapshot.docs.map(document => {
    const data = document.data();
    if (data.organizationId !== session.organizationId || data.jobId !== jobId) throw new Error("Invalid job note tenant");
    return { id: document.id, body: String(data.body ?? ""), authorUserId: String(data.authorUserId ?? ""), authorName: String(data.authorName ?? ""), createdAt: iso(data.createdAt) };
  });
}

export async function listJobActivity(session: AppSession, jobId: string): Promise<JobActivity[]> {
  authorize(session);
  if (!jobIdSchema.safeParse(jobId).success) throw new JobNotFoundError();
  const snapshot = await adminDb.collection("auditLogs").where("organizationId", "==", session.organizationId).where("entityType", "==", "JOB").where("entityId", "==", jobId).orderBy("createdAt", "desc").limit(50).get();
  return snapshot.docs.map(document => {
    const data = document.data();
    if (data.organizationId !== session.organizationId || data.entityId !== jobId) throw new Error("Invalid job activity tenant");
    return { id: document.id, action: String(data.action ?? ""), actorUserId: String(data.actorUserId ?? ""), metadata: data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : {}, createdAt: iso(data.createdAt) };
  });
}

function upperBound(value: string) {
  const chars = Array.from(value);
  for (let i = chars.length - 1; i >= 0; i--) {
    const point = chars[i].codePointAt(0)!;
    if (point < 0x10ffff) return chars.slice(0, i).join("") + String.fromCodePoint(point === 0xd7ff ? 0xe000 : point + 1);
  }
}

/** Active technicians of this tenant for the dispatch picker. */
export async function listTechnicianOptions(session: AppSession, input: TechnicianOptionsInput): Promise<TechnicianOptions> {
  authorize(session);
  const filters = technicianOptionsSchema.parse(input);
  const prefix = normalizeTechnicianName(filters.q);
  let query: Query = adminDb.collection("technicians").where("organizationId", "==", session.organizationId).where("status", "in", [...ACTIVE_TECHNICIAN_STATUSES]);
  if (prefix) {
    query = query.where("nameSearch", ">=", prefix);
    const upper = upperBound(prefix);
    if (upper) query = query.where("nameSearch", "<", upper);
  }
  query = query.orderBy("nameSearch", "asc").orderBy(FieldPath.documentId(), "asc");
  if (filters.cursor) {
    const snapshot = await adminDb.collection("technicians").doc(filters.cursor).get();
    const data = snapshot.data();
    if (!snapshot.exists || !data || data.organizationId !== session.organizationId || !normalizeTechnicianName(String(data.displayName ?? "")).startsWith(prefix)) throw new JobCursorError();
    query = query.startAfter(snapshot);
  }
  const snapshot = await query.limit(TECHNICIAN_OPTION_PAGE_SIZE + 1).get();
  const options: TechnicianOption[] = snapshot.docs.slice(0, TECHNICIAN_OPTION_PAGE_SIZE).map(document => {
    const technician = activeTechnician(document, session);
    return { id: technician.id, name: technician.displayName, secondary: technician.status.charAt(0) + technician.status.slice(1).toLowerCase().replace("_", " ") };
  });
  return { options, nextCursor: snapshot.docs.length > TECHNICIAN_OPTION_PAGE_SIZE ? options[options.length - 1].id : null };
}

export async function listJobs(session: AppSession, input: JobListFilters): Promise<JobListData> {
  authorize(session);
  const filters = jobListFiltersSchema.parse(input), prefix = normalizeJobTitle(filters.q);
  let query: Query = adminDb.collection("jobs").where("organizationId", "==", session.organizationId);
  if (filters.status !== "ALL") query = query.where("status", "==", filters.status);
  if (filters.priority !== "ALL") query = query.where("priority", "==", filters.priority);
  if (prefix) {
    query = query.where("titleSearch", ">=", prefix);
    const upper = upperBound(prefix);
    if (upper) query = query.where("titleSearch", "<", upper);
    query = query.orderBy("titleSearch", "asc").orderBy(FieldPath.documentId(), "asc");
  } else query = query.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (filters.cursor) {
    const snapshot = await adminDb.collection("jobs").doc(filters.cursor).get();
    let cursor: JobDetail;
    try { cursor = detail(snapshot, session); } catch (error) { if (error instanceof JobNotFoundError) throw new JobCursorError(); throw error; }
    if (!normalizeJobTitle(cursor.title).startsWith(prefix) || (filters.status !== "ALL" && cursor.status !== filters.status) || (filters.priority !== "ALL" && cursor.priority !== filters.priority)) throw new JobCursorError();
    query = query.startAfter(snapshot);
  }
  const snapshot = await query.limit(JOB_PAGE_SIZE + 1).get();
  const jobs = snapshot.docs.slice(0, JOB_PAGE_SIZE).map(doc => detail(doc, session));
  return { jobs, filters, nextCursor: snapshot.docs.length > JOB_PAGE_SIZE ? jobs[jobs.length - 1].id : null };
}

/** Jobs scheduled inside a time range, optionally for one technician (schedule views). */
export async function listScheduledJobs(session: AppSession, range: { start: Date; end: Date }, technicianId?: string): Promise<JobDetail[]> {
  authorize(session);
  if (technicianId !== undefined && !jobIdSchema.safeParse(technicianId).success) throw new JobNotFoundError();
  let query: Query = adminDb.collection("jobs").where("organizationId", "==", session.organizationId);
  if (technicianId) query = query.where("assignedTechnicianId", "==", technicianId);
  query = query.where("scheduledAt", ">=", range.start).where("scheduledAt", "<", range.end).orderBy("scheduledAt", "asc").limit(SCHEDULE_LIMIT);
  const snapshot = await query.get();
  return snapshot.docs.map(doc => detail(doc, session));
}

/** Open jobs that still need a visit time (schedule backlog). */
export async function listUnscheduledJobs(session: AppSession): Promise<JobDetail[]> {
  authorize(session);
  const snapshot = await adminDb.collection("jobs").where("organizationId", "==", session.organizationId)
    .where("status", "in", ["NEW", "ASSIGNED", "RESCHEDULED"]).where("scheduledAt", "==", null)
    .orderBy("createdAt", "desc").limit(JOB_PAGE_SIZE).get();
  return snapshot.docs.map(doc => detail(doc, session));
}
