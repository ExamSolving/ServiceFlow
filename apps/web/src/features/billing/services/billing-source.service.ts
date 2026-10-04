import "server-only";

import { notFound } from "next/navigation";

import { requirePermission } from "@/src/lib/auth/authorization";
import { logger } from "@/src/lib/observability/logger";
import { BillingReferenceError, readJobForBilling } from "../repositories/billing-references";
import { billingIdSchema, type BillingDocumentSource } from "../schemas/billing.schema";

/** Prefill for documents raised from a job page; the job pins the customer. */
export async function getBillingSourceFromJob(jobId: string | string[] | undefined, permission: "manageQuotations" | "manageInvoices"): Promise<BillingDocumentSource | null> {
  if (jobId === undefined) return null;
  const session = await requirePermission(permission);
  const id = billingIdSchema.safeParse(Array.isArray(jobId) ? jobId[0] : jobId);
  if (!id.success) notFound();
  try {
    const job = await readJobForBilling(session, id.data);
    return { jobId: job.id, jobNumber: job.jobNumber, customerId: job.customerId, customerName: job.customerName, customerNumber: job.customerNumber, title: job.title };
  } catch (error) {
    if (error instanceof BillingReferenceError) notFound();
    logger.error("BILLING", "Job prefill failed", error);
    throw new Error("We couldn’t load the job for this document. Please try again.");
  }
}
