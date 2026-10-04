import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { logger } from "@/src/lib/observability/logger";
import type { AppSession } from "@/src/features/auth/types/app-session";
import { JobAccessError, JobConflictError, JobNotFoundError, JobReferenceError, JobStateError } from "../repositories/job-errors";
import type { JobDetail } from "../types/job";

export function jobMutationError(error: unknown) {
  if (error instanceof JobAccessError) return jsonError("You don’t have permission to manage jobs.", 403);
  if (error instanceof JobNotFoundError) return jsonError("This record is unavailable in your workspace.", 404);
  if (error instanceof JobConflictError) return jsonError("This record changed or was already saved. Review the latest version before trying again.", 409, { code: "CONFLICT" });
  if (error instanceof JobReferenceError) return jsonError("Check the customer and service type. New selections must be active in your workspace; converted jobs keep their original customer and service type.", 409, { code: "INVALID_REFERENCE" });
  if (error instanceof JobStateError) return jsonError("This record’s status no longer allows this action. Refresh to view its latest state.", 409, { code: "STATE" });
  logger.error("JOBS", "Mutation failed", error);
  return jsonError("We couldn’t save the job. Please try again.", 500);
}

export function revalidateJob(job: Pick<JobDetail, "id" | "serviceRequestId">) {
  for (const path of ["/protected/jobs", `/protected/jobs/${job.id}`, `/protected/jobs/${job.id}/edit`, "/protected/schedule", "/protected/dashboard"]) revalidatePath(path);
  if (job.serviceRequestId) {
    revalidatePath("/protected/service-requests");
    revalidatePath(`/protected/service-requests/${job.serviceRequestId}`);
    revalidatePath(`/protected/service-requests/${job.serviceRequestId}/edit`);
  }
}

export async function mutateJob<T>(request: NextRequest, schema: z.ZodType<T>, save: (session: AppSession, data: T) => Promise<JobDetail>, status = 200) {
  if (!isSameOrigin(request)) return jsonError("Request could not be verified.", 403);
  const auth = await getApiSession("dispatchJobs", "You don’t have permission to manage jobs.");
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody(request, schema, { maxBytes: 32_768, resource: "job" });
  if (!parsed.success) return parsed.response;
  try {
    const job = await save(auth.session, parsed.data);
    revalidateJob(job);
    return NextResponse.json({ job }, { status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jobMutationError(error);
  }
}
