import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { logger } from "@/src/lib/observability/logger";
import { updateOrganizationSettings } from "@/src/features/organization-settings/repositories/organization-settings.repository";
import { organizationSettingsFormSchema } from "@/src/features/organization-settings/schemas/organization-settings.schema";

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageOrganization", "Only the workspace owner can change organization settings.");
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody(request, organizationSettingsFormSchema, { resource: "organization settings" });
  if (!parsed.success) return parsed.response;
  try {
    const result = await updateOrganizationSettings(auth.session, parsed.data);
    revalidatePath("/protected/settings/organization");
    revalidatePath("/protected/dashboard");
    return NextResponse.json({ success: true, changedFields: result.changedFields }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("ORGANIZATION_SETTINGS", "Update failed", error);
    return jsonError("We couldn’t save your organization settings. Please try again.", 500);
  }
}
