import "server-only";

import { requirePermission } from "@/src/lib/auth/authorization";
import { readWorkspaceSettings } from "../repositories/workspace-settings.repository";

export async function getWorkspaceSettings() {
  const session = await requirePermission("manageOrganization");
  return readWorkspaceSettings(session);
}
