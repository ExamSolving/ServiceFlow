import "server-only";

import type { Timestamp, Transaction } from "firebase-admin/firestore";

import { canTransitionJob } from "@/../../packages/domain/src/job-state-machine";
import type { JobStatus } from "@/../../packages/domain/src/job";
import { jobStatusSchema } from "@/src/features/dashboard/schemas/dashboard.schema";
import type { AppSession } from "@/src/features/auth/types/app-session";
import { hasPermission } from "@/src/lib/auth/permissions";
import { adminDb } from "@/src/lib/firebase/admin";

export class BillingReferenceError extends Error {
  constructor(public readonly reference: "CUSTOMER" | "JOB" | "CUSTOMER_MISMATCH") { super(`Invalid billing reference: ${reference}`); this.name = "BillingReferenceError"; }
}

export interface CustomerReference { customerId: string; customerName: string; customerNumber: string; isActive: boolean }
export interface JobReference { id: string; jobNumber: string; status: JobStatus; customerId: string; version: number }

/** Read and verify a tenant customer. Inactive customers stay valid on documents that already reference them. */
export async function readCustomerReference(transaction: Transaction, session: AppSession, customerId: string, allowInactive = false): Promise<CustomerReference> {
  const snapshot = await transaction.get(adminDb.collection("customers").doc(customerId));
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId || typeof data.name !== "string" || !data.name.trim() || typeof data.customerNumber !== "string" || !data.customerNumber) throw new BillingReferenceError("CUSTOMER");
  if (data.isActive !== true && !allowInactive) throw new BillingReferenceError("CUSTOMER");
  return { customerId: snapshot.id, customerName: data.name, customerNumber: data.customerNumber, isActive: data.isActive === true };
}

/** Read and verify a tenant job that belongs to the given customer. */
export async function readJobReference(transaction: Transaction, session: AppSession, jobId: string, customerId: string): Promise<JobReference> {
  const snapshot = await transaction.get(adminDb.collection("jobs").doc(jobId));
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId || typeof data.jobNumber !== "string" || !Number.isSafeInteger(data.version)) throw new BillingReferenceError("JOB");
  const status = jobStatusSchema.safeParse(data.status);
  if (!status.success) throw new BillingReferenceError("JOB");
  if (data.customerId !== customerId) throw new BillingReferenceError("CUSTOMER_MISMATCH");
  return { id: snapshot.id, jobNumber: data.jobNumber, status: status.data, customerId: data.customerId, version: data.version };
}

/**
 * Walk a job along the domain state machine as a side effect of a billing document.
 * Returns the resulting status, or the current one when no step applies.
 */
export function advanceJob(transaction: Transaction, session: AppSession, job: JobReference, path: readonly JobStatus[], reason: Record<string, unknown>, now: Timestamp): JobStatus {
  if (!path.length) return job.status;
  let status = job.status;
  for (const step of path) {
    if (!canTransitionJob(status, step)) throw new Error(`Job ${job.id} cannot move from ${status} to ${step}`);
    status = step;
  }
  const update: Record<string, unknown> = { status, version: job.version + 1, updatedAt: now };
  if (status === "COMPLETED") update.completedAt = now;
  transaction.update(adminDb.collection("jobs").doc(job.id), update);
  transaction.create(adminDb.collection("auditLogs").doc(), {
    organizationId: session.organizationId, actorUserId: session.uid, entityType: "JOB", entityId: job.id, action: "JOB_STATUS_CHANGED",
    metadata: { from: job.status, to: status, path, version: job.version + 1, ...reason }, createdAt: now,
  });
  return status;
}

export interface BillingJobSummary { id: string; jobNumber: string; status: JobStatus; customerId: string; customerName: string; customerNumber: string; title: string }

/** Job details for raising a document from a job page; billing roles do not need dispatchJobs. */
export async function readJobForBilling(session: AppSession, jobId: string): Promise<BillingJobSummary> {
  if (!hasPermission(session.role, "manageQuotations") && !hasPermission(session.role, "manageInvoices")) throw new BillingReferenceError("JOB");
  const snapshot = await adminDb.collection("jobs").doc(jobId).get();
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId || typeof data.jobNumber !== "string" || typeof data.customerId !== "string" || typeof data.customerName !== "string" || typeof data.customerNumber !== "string" || typeof data.title !== "string") throw new BillingReferenceError("JOB");
  const status = jobStatusSchema.safeParse(data.status);
  if (!status.success) throw new BillingReferenceError("JOB");
  return { id: snapshot.id, jobNumber: data.jobNumber, status: status.data, customerId: data.customerId, customerName: data.customerName, customerNumber: data.customerNumber, title: data.title };
}
