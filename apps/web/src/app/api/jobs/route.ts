import type { NextRequest } from "next/server";
import { jobCreateSchema } from "@/src/features/jobs/schemas/job.schema";
import { createJob } from "@/src/features/jobs/repositories/job.repository";
import { mutateJob } from "@/src/features/jobs/services/job-api";
export async function POST(request: NextRequest) {
  return mutateJob(request, jobCreateSchema, createJob, 201);
}
