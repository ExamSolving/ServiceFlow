import "server-only";

import { jsonError } from "@/src/lib/http/json";
import { logger } from "@/src/lib/observability/logger";
import {
  InvitationNotFoundError, InvitationStateError, MemberAccessError, MemberConflictError, MemberNotFoundError, MemberRuleError,
} from "../repositories/member-errors";

export function memberMutationError(error: unknown) {
  if (error instanceof MemberAccessError) return jsonError("You don’t have permission to manage the team.", 403);
  if (error instanceof MemberNotFoundError) return jsonError("This team member could not be found.", 404);
  if (error instanceof InvitationNotFoundError) return jsonError("This invitation could not be found.", 404);
  if (error instanceof MemberRuleError) {
    const messages: Record<MemberRuleError["code"], string> = {
      OWNER_PROTECTED: "The workspace owner’s access cannot be changed from the team page.",
      SELF_CHANGE: "You can’t change your own role or access. Ask another administrator.",
      ALREADY_MEMBER: "Someone with this email is already a member of your workspace.",
      INVITATION_PENDING: "An invitation for this email is still pending. Copy or regenerate its link instead.",
      MEMBER_SUSPENDED: "This person’s membership is suspended. Reactivate it from the team page instead of inviting again.",
    };
    return jsonError(messages[error.code], 409, { code: error.code });
  }
  if (error instanceof InvitationStateError) {
    const messages: Record<InvitationStateError["code"], string> = {
      EXPIRED: "This invitation has expired. Ask for a new link.",
      REVOKED: "This invitation was revoked.",
      ACCEPTED: "This invitation has already been used.",
      EMAIL_MISMATCH: "This invitation was sent to a different email address.",
    };
    return jsonError(messages[error.code], 409, { code: error.code });
  }
  if (error instanceof MemberConflictError) return jsonError("This record has changed. Reload the page before trying again.", 409, { code: "CONFLICT" });
  logger.error("TEAM", "Mutation failed", error);
  return jsonError("We couldn’t save this change. Please try again.", 500);
}
