import "server-only";
import { notFound } from "next/navigation";
import { requirePermission } from "@/src/lib/auth/authorization";
import { adminDb } from "@/src/lib/firebase/admin";
import { logger } from "@/src/lib/observability/logger";
import { getJobBilling } from "@/src/features/billing/services/job-billing.service";
import { listJobActivity, listJobNotes, listJobs, readJob } from "../repositories/job.repository";
import { JobCursorError, JobNotFoundError } from "../repositories/job-errors";
import { jobListFiltersSchema } from "../schemas/job.schema";
import type { JobContext, JobListData, JobSearchParams } from "../types/job";

export async function getJobsPage(params: JobSearchParams): Promise<JobListData> {
  const session = await requirePermission("dispatchJobs");
  const parsed = jobListFiltersSchema.safeParse({ q: params.q, status: params.status, priority: params.priority, cursor: params.cursor });
  if (!parsed.success) return { jobs: [], filters: { q: "", status: "ALL", priority: "ALL" }, nextCursor: null, filterError: "These filters are invalid. Clear them and try again." };
  try { return await listJobs(session, parsed.data); }
  catch (error) {
    if (error instanceof JobCursorError) return { jobs: [], filters: parsed.data, nextCursor: null, filterError: "This page is no longer available. Return to the first page." };
    logger.error("JOBS", "List failed", error);
    throw new Error("We couldn’t load jobs. Please try again.");
  }
}
export async function getJob(id: string) {
  const session = await requirePermission("dispatchJobs");
  try { return await readJob(session, id); }
  catch (error) {
    if (error instanceof JobNotFoundError) notFound();
    logger.error("JOBS", "Read failed", error);
    throw new Error("We couldn’t load this job. Please try again.");
  }
}

async function readTimezone(organizationId: string): Promise<string> {
  try {
    const snapshot = await adminDb.collection("organizationSettings").doc(organizationId).get();
    const timezone = snapshot.data()?.timezone;
    return typeof timezone === "string" && timezone ? timezone : "UTC";
  } catch {
    return "UTC";
  }
}

/** Job page data: the record plus its notes, activity and the organization timezone. */
export async function getJobContext(id: string): Promise<JobContext> {
  const session = await requirePermission("dispatchJobs");
  let job;
  try { job = await readJob(session, id); }
  catch (error) {
    if (error instanceof JobNotFoundError) notFound();
    logger.error("JOBS", "Read failed", error);
    throw new Error("We couldn’t load this job. Please try again.");
  }
  const [notes, activity, timezone, billing] = await Promise.all([
    listJobNotes(session, job.id).catch((error) => { logger.error("JOBS", "Notes failed", error); return []; }),
    listJobActivity(session, job.id).catch((error) => { logger.error("JOBS", "Activity failed", error); return []; }),
    readTimezone(session.organizationId),
    getJobBilling(session, job.id),
  ]);
  return { job, notes, activity, timezone, billing };
}
