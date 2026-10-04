import "server-only";

import type { NextResponse } from "next/server";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { resolveAppSession } from "@/src/lib/auth/app-session";
import { adminAuth } from "@/src/lib/firebase/admin";
import { jsonError } from "./json";

export type MobileSessionResult = { ok: true; session: AppSession } | { ok: false; response: NextResponse };

// Firebase ID tokens are JWTs: three base64url segments separated by dots.
const BEARER = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

/**
 * Resolve the session for a request from the mobile app. The app sends its
 * Firebase ID token as a Bearer token (no cookies), so there is no CSRF
 * exposure; the token is checked for revocation and a verified email, and
 * the same AppSession rules as the web apply.
 */
export async function getMobileSession(request: Request): Promise<MobileSessionResult> {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const match = header.length <= 8192 ? BEARER.exec(header) : null;
  if (!match) return { ok: false, response: jsonError("Sign in to continue.", 401, { code: "UNAUTHENTICATED" }) };

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(match[1], true);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code === "auth/id-token-expired") return { ok: false, response: jsonError("Your sign-in needs refreshing.", 401, { code: "TOKEN_EXPIRED" }) };
    if (code === "auth/id-token-revoked" || code === "auth/user-disabled") {
      return { ok: false, response: jsonError("Your session has ended. Sign in again.", 401, { code: "SESSION_REVOKED" }) };
    }
    return { ok: false, response: jsonError("Sign in to continue.", 401, { code: "UNAUTHENTICATED" }) };
  }

  if (decoded.email_verified !== true) {
    return { ok: false, response: jsonError("Verify your email to continue.", 403, { code: "EMAIL_NOT_VERIFIED" }) };
  }
  const resolved = await resolveAppSession({
    uid: decoded.uid,
    email: decoded.email,
    name: typeof decoded.name === "string" ? decoded.name : undefined,
  });
  if ("reason" in resolved) {
    return { ok: false, response: jsonError("Your account is not active in a ServiceFlow workspace.", 403, { code: "ACCOUNT_UNAVAILABLE", reason: resolved.reason }) };
  }
  return { ok: true, session: resolved.session };
}
