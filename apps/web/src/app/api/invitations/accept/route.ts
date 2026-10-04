import { NextResponse, type NextRequest } from "next/server";

import { adminAuth } from "@/src/lib/firebase/admin";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { logger } from "@/src/lib/observability/logger";
import { acceptInvitation } from "@/src/features/members/repositories/member.repository";
import { invitationAcceptSchema } from "@/src/features/members/schemas/member.schema";
import { memberMutationError } from "@/src/features/members/services/member-api";

export const runtime = "nodejs";

/**
 * Accept an invitation with a fresh Firebase ID token (no server session yet).
 * The email on the verified token must match the invitation.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Request could not be verified.", 403);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return jsonError("Authentication required.", 401, { code: "UNAUTHENTICATED" });
  let identity: { uid: string; email: string; displayName?: string };
  try {
    const decoded = await adminAuth.verifyIdToken(authorization.substring(7));
    if (!decoded.email) return jsonError("Authenticated user has no email address.", 400);
    if (decoded.email_verified !== true) return jsonError("Verify your email before accepting the invitation.", 403, { code: "EMAIL_NOT_VERIFIED" });
    identity = { uid: decoded.uid, email: decoded.email, displayName: typeof decoded.name === "string" ? decoded.name : undefined };
  } catch (error) {
    logger.warn("TEAM", "Invitation accept token rejected", { error: error instanceof Error ? error.message : String(error) });
    return jsonError("Authentication required.", 401, { code: "UNAUTHENTICATED" });
  }
  const parsed = await parseJsonBody(request, invitationAcceptSchema, { resource: "invitation" });
  if (!parsed.success) return parsed.response;
  try {
    const result = await acceptInvitation(identity, parsed.data.token);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return memberMutationError(error);
  }
}
