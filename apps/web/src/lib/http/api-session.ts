import "server-only";

import type { NextResponse } from "next/server";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { requireAuth } from "@/src/lib/auth/require-auth";
import { hasPermission, type Permission } from "@/src/lib/auth/permissions";
import { jsonError } from "./json";

export type ApiSessionResult = { ok: true; session: AppSession } | { ok: false; response: NextResponse };

// `redirect()` and `notFound()` throw errors carrying a digest. Route Handlers
// must answer JSON, so the page-oriented redirect is translated here.
export function isNextRedirectError(error: unknown): error is Error & { digest: string } {
  return typeof error === "object" && error !== null && "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT");
}

/**
 * Resolve the session for a JSON Route Handler. Unauthenticated callers get a
 * 401 JSON response (never a redirect); callers without the permission get 403.
 * Any other failure is rethrown so unexpected errors are not masked.
 */
export async function getApiSession(permission?: Permission, deniedMessage?: string): Promise<ApiSessionResult> {
  let session: AppSession;
  try {
    session = await requireAuth();
  } catch (error) {
    if (isNextRedirectError(error)) {
      const unavailable = error.digest.includes("reason=account");
      return {
        ok: false,
        response: jsonError(
          unavailable ? "Your account is not active in a ServiceFlow workspace." : "Authentication required.",
          401,
          { code: unavailable ? "ACCOUNT_UNAVAILABLE" : "UNAUTHENTICATED" },
        ),
      };
    }
    throw error;
  }
  if (permission && !hasPermission(session.role, permission)) {
    return { ok: false, response: jsonError(deniedMessage ?? "You don’t have permission to do this.", 403, { code: "FORBIDDEN" }) };
  }
  return { ok: true, session };
}
