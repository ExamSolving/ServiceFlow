import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { logger } from "@/src/lib/observability/logger";
import { updateWorkspaceSettings, WorkspaceSettingsAccessError } from "@/src/features/workspace-settings/repositories/workspace-settings.repository";
import { workspaceSettingsFormSchema } from "@/src/features/workspace-settings/schemas/workspace-settings.schema";

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageOrganization", "Only the workspace owner can change workspace settings.");
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody(request, workspaceSettingsFormSchema, { resource: "workspace settings" });
  if (!parsed.success) return parsed.response;
  try {
    const result = await updateWorkspaceSettings(auth.session, parsed.data);
    revalidatePath("/protected/settings");
    revalidatePath("/protected/dashboard");
    return NextResponse.json({ success: true, changedFields: result.changedFields }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof WorkspaceSettingsAccessError) return jsonError("Only the workspace owner can change workspace settings.", 403);
    logger.error("WORKSPACE_SETTINGS", "Update failed", error);
    return jsonError("We couldn’t save your workspace settings. Please try again.", 500);
  }
}
