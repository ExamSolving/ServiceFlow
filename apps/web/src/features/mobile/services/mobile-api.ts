import "server-only";

import { revalidatePath } from "next/cache";
import type { NextResponse } from "next/server";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { jsonError } from "@/src/lib/http/json";
import { getMobileSession } from "@/src/lib/http/mobile-session";
import { logger } from "@/src/lib/observability/logger";
import { MobileJobConflictError, MobileJobNotFoundError, MobileJobReasonError, MobileJobStateError } from "../repositories/mobile-jobs.repository";
import { readMobileSession } from "../repositories/mobile-session.repository";
import type { MobileTechnician } from "../types/mobile-session";

export type MobileTechnicianResult =
  | { ok: true; session: AppSession; technician: MobileTechnician }
  | { ok: false; response: NextResponse };

/**
 * The checks of /api/mobile/session (Bearer ID token, revocation, verified
 * email, active membership), plus: a Technician with a linked, active
 * technician profile. Anyone else gets 403 TECHNICIAN_UNAVAILABLE with the
 * session's access value, so the app can re-check the account.
 */
export async function requireMobileTechnician(request: Request): Promise<MobileTechnicianResult> {
  const auth = await getMobileSession(request);
  if (!auth.ok) return auth;
  const account = await readMobileSession(auth.session);
  if (account.access !== "ALLOWED" || !account.technician) {
    return { ok: false, response: jsonError("This account can’t use the technician app right now.", 403, { code: "TECHNICIAN_UNAVAILABLE", access: account.access }) };
  }
  return { ok: true, session: auth.session, technician: account.technician };
}

/** Answer a failed technician job request with a code the app understands; unexpected errors are logged, never shown. */
export function mobileJobError(error: unknown, fallback: string) {
  if (error instanceof MobileJobNotFoundError) return jsonError("This job isn’t assigned to you anymore.", 404, { code: "NOT_FOUND" });
  if (error instanceof MobileJobConflictError) return jsonError("This job changed since you opened it. Reload it and try again.", 409, { code: "CONFLICT" });
  if (error instanceof MobileJobStateError) return jsonError("The job’s status no longer allows this. Reload it to see what’s next.", 409, { code: "STATE" });
  if (error instanceof MobileJobReasonError) return jsonError("Add a reason first.", 400, { code: "REASON_REQUIRED" });
  logger.error("MOBILE", "Job request failed", error);
  return jsonError(fallback, 500);
}

/** Refresh the office's pages after a change from the app (the same pages as a web job change). */
export function revalidateTechnicianJob(jobId: string) {
  for (const path of ["/protected/jobs", `/protected/jobs/${jobId}`, "/protected/schedule", "/protected/dashboard"]) revalidatePath(path);
}
