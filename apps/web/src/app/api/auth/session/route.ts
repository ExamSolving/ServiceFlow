import { NextRequest, NextResponse } from "next/server";

import { resolveAppSession } from "@/src/lib/auth/app-session";
import { adminAuth } from "@/src/lib/firebase/admin";
import { jsonError } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { logger } from "@/src/lib/observability/logger";

import {
  SESSION_COOKIE_NAME,
  SESSION_EXPIRES_IN,
} from "@/src/lib/auth/constants";

export const runtime = "nodejs";

/**
 * Exchange a fresh, verified Firebase ID token for the HttpOnly session cookie.
 * The cookie is only issued when the ServiceFlow account resolves, so a user
 * without an active workspace is told why instead of being redirected forever.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return jsonError("Invalid request origin.", 403);
  }

  let idToken: unknown;
  try {
    const body = await request.json();
    idToken = body?.idToken;
  } catch {
    return jsonError("Firebase ID token is required.", 400);
  }
  if (!idToken || typeof idToken !== "string") {
    return jsonError("Firebase ID token is required.", 400);
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    if (decodedToken.email_verified !== true) {
      return jsonError("Email verification required.", 403, { code: "EMAIL_NOT_VERIFIED" });
    }

    // Require a recent login so an old stolen token cannot become a session.
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const authenticatedAt = decodedToken.auth_time;
    if (!authenticatedAt || nowInSeconds - authenticatedAt > 5 * 60) {
      return jsonError("Recent authentication is required.", 401, { code: "RECENT_LOGIN_REQUIRED" });
    }

    const resolved = await resolveAppSession({
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: typeof decodedToken.name === "string" ? decodedToken.name : undefined,
    });
    if ("reason" in resolved) {
      return jsonError("Your account is not active in a ServiceFlow workspace.", 403, {
        code: "ACCOUNT_UNAVAILABLE",
        reason: resolved.reason,
      });
    }

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRES_IN,
    });

    const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_EXPIRES_IN / 1000,
    });
    return response;
  } catch (error) {
    logger.error("AUTH", "Session creation failed", error);
    return jsonError("Unable to create session.", 401, { code: "SESSION_FAILED" });
  }
}
