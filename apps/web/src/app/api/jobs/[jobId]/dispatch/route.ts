import type { NextRequest } from "next/server";
import { jobDispatchSchema } from "@/src/features/jobs/schemas/job.schema";
import { dispatchJob } from "@/src/features/jobs/repositories/job.repository";
import { mutateJob } from "@/src/features/jobs/services/job-api";

export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  return mutateJob(request, jobDispatchSchema, (session, data) => dispatchJob(session, jobId, data), 200);
}
