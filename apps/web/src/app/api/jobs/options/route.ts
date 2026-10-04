import { NextResponse, type NextRequest } from "next/server";

import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError } from "@/src/lib/http/json";
import { logger } from "@/src/lib/observability/logger";
import { JobAccessError, JobCursorError } from "@/src/features/jobs/repositories/job-errors";
import { listTechnicianOptions } from "@/src/features/jobs/repositories/job.repository";
import { technicianOptionsSchema } from "@/src/features/jobs/schemas/job.schema";

export const dynamic = "force-dynamic";

// Active technicians of the session's tenant for the dispatch picker.
export async function GET(request: NextRequest) {
  const auth = await getApiSession("dispatchJobs", "You don’t have permission to manage jobs.");
  if (!auth.ok) return auth.response;
  const params = request.nextUrl.searchParams;
  const parsed = technicianOptionsSchema.safeParse({ q: params.get("q") ?? undefined, cursor: params.get("cursor") ?? undefined });
  if (!parsed.success) return jsonError("These search options are invalid.", 400);
  try {
    const result = await listTechnicianOptions(auth.session, parsed.data);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof JobAccessError) return jsonError("You don’t have permission to manage jobs.", 403);
    if (error instanceof JobCursorError) return jsonError("This page of options is no longer available. Search again.", 400, { code: "CURSOR" });
    logger.error("JOBS", "Technician options failed", error);
    return jsonError("We couldn’t load technicians. Please try again.", 500);
  }
}
