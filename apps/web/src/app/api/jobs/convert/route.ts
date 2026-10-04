import type { NextRequest } from "next/server";
import { jobConvertSchema } from "@/src/features/jobs/schemas/job.schema";
import { convertRequestToJob } from "@/src/features/jobs/repositories/job.repository";
import { mutateJob } from "@/src/features/jobs/services/job-api";
export async function POST(request: NextRequest) {
  return mutateJob(request, jobConvertSchema, convertRequestToJob, 201);
}
