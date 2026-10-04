import type { NextRequest } from "next/server";
import { jobActionSchema } from "@/src/features/jobs/schemas/job.schema";
import { cancelJob, transitionJob } from "@/src/features/jobs/repositories/job.repository";
import { mutateJob } from "@/src/features/jobs/services/job-api";

// CANCEL is kept for existing clients; TRANSITION moves along the domain state machine.
export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  return mutateJob(request, jobActionSchema, (session, data) => data.action === "CANCEL" ? cancelJob(session, jobId, data) : transitionJob(session, jobId, data), 200);
}
