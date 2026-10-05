import type { NextRequest } from "next/server";

import { readMobileSession } from "@/src/features/mobile/repositories/mobile-session.repository";
import { jsonError, jsonOk } from "@/src/lib/http/json";
import { getMobileSession } from "@/src/lib/http/mobile-session";
import { logger } from "@/src/lib/observability/logger";

export const dynamic = "force-dynamic";

// Called by the mobile app after Firebase sign-in: who is this, and may they use the technician app?
export async function GET(request: NextRequest) {
  try {
    const auth = await getMobileSession(request);
    if (!auth.ok) return auth.response;
    return jsonOk({ session: await readMobileSession(auth.session) });
  } catch (error) {
    logger.error("MOBILE", "Session lookup failed", error);
    return jsonError("We couldn’t load your account. Please try again.", 500);
  }
}
