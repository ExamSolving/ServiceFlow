import "server-only";

import { requirePermission } from "@/src/lib/auth/authorization";
import { logger } from "@/src/lib/observability/logger";
import { listTeam, previewInvitation } from "../repositories/member.repository";
import type { InvitationPreview, TeamData } from "../types/member";

export async function getTeamPage(): Promise<TeamData> {
  const session = await requirePermission("manageUsers");
  try {
    return await listTeam(session);
  } catch (error) {
    logger.error("TEAM", "List failed", error);
    throw new Error("We couldn’t load your team. Please try again.");
  }
}

/** Public: what the holder of an invitation link is being invited to. */
export async function getInvitationPreview(token: string): Promise<InvitationPreview | null> {
  try {
    return await previewInvitation(token);
  } catch (error) {
    logger.error("TEAM", "Invitation preview failed", error);
    return null;
  }
}
