import type { Metadata } from "next";

import { WorkspaceSettingsView } from "@/src/features/workspace-settings/components/workspace-settings-view";
import { getWorkspaceSettings } from "@/src/features/workspace-settings/services/workspace-settings.service";

export const metadata: Metadata = { title: "Settings" };

export default async function WorkspaceSettingsPage() {
  const data = await getWorkspaceSettings();
  return <WorkspaceSettingsView data={data} />;
}
