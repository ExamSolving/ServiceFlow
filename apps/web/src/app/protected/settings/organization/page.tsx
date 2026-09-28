import type { Metadata } from "next";

import { OrganizationSettingsView } from "@/src/features/organization-settings/components/organization-settings-view";
import { getOrganizationSettings } from "@/src/features/organization-settings/services/organization-settings.service";

export const metadata: Metadata = { title: "Organization settings" };

export default async function OrganizationSettingsPage() {
  const data = await getOrganizationSettings();
  return <OrganizationSettingsView data={data} />;
}
