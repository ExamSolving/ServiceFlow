import "server-only";

import { requirePermission } from "@/src/lib/auth/authorization";
import {
  readOrganizationSettings,
  updateOrganizationSettings,
} from "../repositories/organization-settings.repository";
import type { OrganizationSettingsInput } from "../schemas/organization-settings.schema";

export async function getOrganizationSettings() {
  const session = await requirePermission("manageOrganization");
  return readOrganizationSettings(session);
}

export async function saveOrganizationSettings(input: OrganizationSettingsInput) {
  const session = await requirePermission("manageOrganization");
  return updateOrganizationSettings(session, input);
}
