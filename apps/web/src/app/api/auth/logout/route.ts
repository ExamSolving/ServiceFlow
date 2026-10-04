import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/src/lib/auth/constants";
import { adminAuth } from "@/src/lib/firebase/admin";
import { jsonError } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { logger } from "@/src/lib/observability/logger";

export const runtime = "nodejs";

/**
 * Sign out: revoke the user's refresh tokens so the session cookie (verified
 * with checkRevoked) stops working everywhere, then clear the cookie.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return jsonError("Request could not be verified.", 403);
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookie) {
    try {
      const decoded = await adminAuth.verifySessionCookie(cookie);
      await adminAuth.revokeRefreshTokens(decoded.sub);
    } catch (error) {
      // An expired or already revoked cookie still gets cleared below.
      logger.warn("AUTH", "Could not revoke session on logout", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
