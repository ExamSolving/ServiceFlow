import { NextResponse } from "next/server";

import { getAppSessionState } from "@/src/lib/auth/app-session";
import { logger } from "@/src/lib/observability/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getAppSessionState();
    if (state.kind !== "active") {
      return NextResponse.json(
        { message: state.kind === "unavailable" ? "Your account is not active in a ServiceFlow workspace." : "Authentication required.", code: state.kind === "unavailable" ? "ACCOUNT_UNAVAILABLE" : "UNAUTHENTICATED" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ session: state.session }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("AUTH", "Session lookup failed", error);
    return NextResponse.json({ message: "Unable to load the current session." }, { status: 500 });
  }
}
