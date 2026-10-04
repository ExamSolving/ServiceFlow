import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { setMemberStatus } from "@/src/features/members/repositories/member.repository";
import { memberIdSchema, memberStatusSchema } from "@/src/features/members/schemas/member.schema";
import { memberMutationError } from "@/src/features/members/services/member-api";

export async function POST(request: NextRequest, context: { params: Promise<{ membershipId: string }> }) {
  if (!isSameOrigin(request)) return jsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageUsers", "You don’t have permission to manage the team.");
  if (!auth.ok) return auth.response;
  const { membershipId } = await context.params;
  if (!memberIdSchema.safeParse(membershipId).success) return jsonError("This team member could not be found.", 404);
  const parsed = await parseJsonBody(request, memberStatusSchema, { resource: "team member" });
  if (!parsed.success) return parsed.response;
  try {
    const member = await setMemberStatus(auth.session, membershipId, parsed.data);
    revalidatePath("/protected/settings/team");
    revalidatePath("/protected/technicians/new");
    return NextResponse.json({ member }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return memberMutationError(error);
  }
}
