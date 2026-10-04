import "server-only";
import { createHash } from "node:crypto";
import { FieldPath, Timestamp, type DocumentSnapshot, type Query, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/src/lib/firebase/admin";
import { hasPermission } from "@/src/lib/auth/permissions";
import type { AppSession } from "@/src/features/auth/types/app-session";
import { serviceRequestFormSchema } from "@/src/features/service-requests/schemas/service-request.schema";
import { canEditServiceRequest } from "@/src/features/service-requests/utils/request-workflow";
import { organizationSettingsRecordSchema } from "@/src/features/organization-settings/schemas/organization-settings.schema";
import { jobCancelSchema, jobConvertSchema, jobCreateSchema, jobDetailSchema, jobIdSchema, jobListFiltersSchema, jobUpdateSchema, normalizeJobTitle, type JobCancelInput, type JobConvertInput, type JobCreateInput, type JobUpdateInput } from "../schemas/job.schema";
import type { JobDetail, JobFormValues, JobListData, JobListFilters } from "../types/job";
import { canCancelJob, canEditJob } from "../utils/job-workflow";
import { JobAccessError, JobConflictError, JobCursorError, JobNotFoundError, JobReferenceError, JobStateError } from "./job-errors";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fields = ["customerId", "serviceTypeId", "title", "description", "priority", "serviceAddress"] as const;
export const JOB_PAGE_SIZE = 25;
function authorize(session: AppSession) {
  if (!jobIdSchema.safeParse(session.uid).success || !jobIdSchema.safeParse(session.organizationId).success || !hasPermission(session.role, "dispatchJobs")) throw new JobAccessError();
}
function iso(value: unknown) {
  if (!(value instanceof Timestamp)) throw new Error("Invalid job timestamp");
  return value.toDate().toISOString();
}
function owned(snapshot: DocumentSnapshot, session: AppSession) {
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId) throw new JobNotFoundError();
  return data;
}
function detail(snapshot: DocumentSnapshot, session: AppSession): JobDetail {
  const data = owned(snapshot, session);
  // Strip server-only persistence fields before returning the public DTO.
  const parsed = jobDetailSchema.strip().parse({ ...data, id: snapshot.id, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt), scheduledAt: data.scheduledAt == null ? null : iso(data.scheduledAt) });
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
  return {
    customerName: current?.customerId === values.customerId ? current.customerName : c.name,
    customerNumber: current?.customerId === values.customerId ? current.customerNumber : c.customerNumber,
    serviceTypeName: current?.serviceTypeId === values.serviceTypeId ? current.serviceTypeName : s.name,
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
  const record = { ...values, ...names, jobNumber: numbering.jobNumber, serviceRequestId: sourceId, status: "NEW" as const, assignedTechnicianId: null, scheduledAt: null, version: 1 };
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
function upperBound(value: string) {
  const chars = Array.from(value);
  for (let i = chars.length - 1; i >= 0; i--) {
    const point = chars[i].codePointAt(0)!;
    if (point < 0x10ffff) return chars.slice(0, i).join("") + String.fromCodePoint(point === 0xd7ff ? 0xe000 : point + 1);
  }
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
