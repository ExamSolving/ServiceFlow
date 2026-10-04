import type { WorkspaceSettingsRecord } from "../schemas/workspace-settings.schema";

export interface WorkspaceSettingsData {
  organizationName: string;
  timezone: string;
  settings: WorkspaceSettingsRecord;
}
