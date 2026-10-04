import type { NextRequest } from "next/server";
import { jobUpdateSchema } from "@/src/features/jobs/schemas/job.schema";
import { updateJob } from "@/src/features/jobs/repositories/job.repository";
import { mutateJob } from "@/src/features/jobs/services/job-api";
export async function PATCH(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  return mutateJob(request, jobUpdateSchema, (session, data) => updateJob(session, jobId, data), 200);
}
