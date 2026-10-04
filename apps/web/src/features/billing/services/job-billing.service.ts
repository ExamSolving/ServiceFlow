import "server-only";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { listInvoicesForJob } from "@/src/features/invoices/repositories/invoice.repository";
import { listQuotationsForJob } from "@/src/features/quotations/repositories/quotation.repository";
import { hasPermission } from "@/src/lib/auth/permissions";
import { logger } from "@/src/lib/observability/logger";
import type { JobBilling } from "../types/job-billing";

export type { JobBilling };

/** Billing documents linked to a job, for the job page. Failures degrade to an empty section. */
export async function getJobBilling(session: AppSession, jobId: string): Promise<JobBilling> {
  const canQuote = hasPermission(session.role, "manageQuotations");
  const canInvoice = hasPermission(session.role, "manageInvoices");
  try {
    const [quotations, invoices] = await Promise.all([listQuotationsForJob(session, jobId), listInvoicesForJob(session, jobId)]);
    return { quotations, invoices, canQuote, canInvoice, unavailable: false };
  } catch (error) {
    logger.error("BILLING", "Job billing failed", error);
    return { quotations: [], invoices: [], canQuote, canInvoice, unavailable: true };
  }
}
