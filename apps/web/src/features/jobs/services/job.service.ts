import "server-only";
import { notFound } from "next/navigation";
import { requirePermission } from "@/src/lib/auth/authorization";
import { listJobs, readJob } from "../repositories/job.repository";
import { JobCursorError, JobNotFoundError } from "../repositories/job-errors";
import { jobListFiltersSchema } from "../schemas/job.schema";
import type { JobListData, JobSearchParams } from "../types/job";
export async function getJobsPage(params: JobSearchParams): Promise<JobListData> {
  const session = await requirePermission("dispatchJobs");
  const parsed = jobListFiltersSchema.safeParse({ q: params.q, status: params.status, priority: params.priority, cursor: params.cursor });
  if (!parsed.success) return { jobs: [], filters: { q: "", status: "ALL", priority: "ALL" }, nextCursor: null, filterError: "These filters are invalid. Clear them and try again." };
  try { return await listJobs(session, parsed.data); }
  catch (error) {
    if (error instanceof JobCursorError) return { jobs: [], filters: parsed.data, nextCursor: null, filterError: "This page is no longer available. Return to the first page." };
    console.error("[JOBS] List failed", error);
    throw new Error("We couldn’t load jobs. Please try again.");
  }
}
export async function getJob(id: string) {
  const session = await requirePermission("dispatchJobs");
  try { return await readJob(session, id); }
  catch (error) {
    if (error instanceof JobNotFoundError) notFound();
    console.error("[JOBS] Read failed", error);
    throw new Error("We couldn’t load this job. Please try again.");
  }
}
