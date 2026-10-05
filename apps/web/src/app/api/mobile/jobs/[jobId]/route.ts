import type { NextRequest } from "next/server";

import { readTechnicianJob } from "@/src/features/mobile/repositories/mobile-jobs.repository";
import { mobileJobError, requireMobileTechnician } from "@/src/features/mobile/services/mobile-api";
import { jsonOk } from "@/src/lib/http/json";

export const dynamic = "force-dynamic";

// One of the technician's jobs: details, customer phone while open, notes, status history and allowed moves.
export async function GET(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const auth = await requireMobileTechnician(request);
    if (!auth.ok) return auth.response;
    const { jobId } = await context.params;
    return jsonOk({ job: await readTechnicianJob(auth.session, auth.technician, jobId) });
  } catch (error) {
    return mobileJobError(error, "We couldn’t load this job. Please try again.");
  }
}
