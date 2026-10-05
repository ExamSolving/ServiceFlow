import type { NextRequest } from "next/server";

import { listTechnicianJobs } from "@/src/features/mobile/repositories/mobile-jobs.repository";
import { mobileJobError, requireMobileTechnician } from "@/src/features/mobile/services/mobile-api";
import { jsonOk } from "@/src/lib/http/json";

export const dynamic = "force-dynamic";

// The signed-in technician's open jobs and those completed in the last 7 days.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireMobileTechnician(request);
    if (!auth.ok) return auth.response;
    return jsonOk({ jobs: await listTechnicianJobs(auth.session, auth.technician) });
  } catch (error) {
    return mobileJobError(error, "We couldn’t load your jobs. Please try again.");
  }
}
