import type { NextRequest } from "next/server";

import { moveTechnicianJob } from "@/src/features/mobile/repositories/mobile-jobs.repository";
import { mobileJobMoveSchema } from "@/src/features/mobile/schemas/mobile-jobs.schema";
import { mobileJobError, requireMobileTechnician, revalidateTechnicianJob } from "@/src/features/mobile/services/mobile-api";
import { jsonOk, parseJsonBody } from "@/src/lib/http/json";

export const dynamic = "force-dynamic";

// A status move from the technician app. Answers { job } — or { job: null } after a decline, when the job leaves the technician's list.
export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const auth = await requireMobileTechnician(request);
    if (!auth.ok) return auth.response;
    const { jobId } = await context.params;
    const parsed = await parseJsonBody(request, mobileJobMoveSchema, { resource: "status update" });
    if (!parsed.success) return parsed.response;
    const result = await moveTechnicianJob(auth.session, auth.technician, jobId, parsed.data);
    revalidateTechnicianJob(jobId);
    return jsonOk(result);
  } catch (error) {
    return mobileJobError(error, "We couldn’t update this job. Please try again.");
  }
}
