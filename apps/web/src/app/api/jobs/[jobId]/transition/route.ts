import type { NextRequest } from "next/server";
import { jobCancelSchema } from "@/src/features/jobs/schemas/job.schema";
import { cancelJob } from "@/src/features/jobs/repositories/job.repository";
import { mutateJob } from "@/src/features/jobs/services/job-api";
export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  return mutateJob(request, jobCancelSchema, (session, data) => cancelJob(session, jobId, data), 200);
}
