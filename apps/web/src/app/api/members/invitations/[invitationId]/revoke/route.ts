import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { revokeInvitation } from "@/src/features/members/repositories/member.repository";
import { invitationIdSchema, invitationVersionSchema } from "@/src/features/members/schemas/member.schema";
import { memberMutationError } from "@/src/features/members/services/member-api";

export async function POST(request: NextRequest, context: { params: Promise<{ invitationId: string }> }) {
  if (!isSameOrigin(request)) return jsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageUsers", "You don’t have permission to manage the team.");
  if (!auth.ok) return auth.response;
  const { invitationId } = await context.params;
  if (!invitationIdSchema.safeParse(invitationId).success) return jsonError("This invitation could not be found.", 404);
  const parsed = await parseJsonBody(request, invitationVersionSchema, { resource: "invitation" });
  if (!parsed.success) return parsed.response;
  try {
    const invitation = await revokeInvitation(auth.session, invitationId, parsed.data);
    revalidatePath("/protected/settings/team");
    return NextResponse.json({ invitation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return memberMutationError(error);
  }
}
