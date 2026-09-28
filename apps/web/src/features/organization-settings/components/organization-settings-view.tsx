import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import type { OrganizationSettingsData } from "../types/organization-settings";
import { OrganizationSettingsForm } from "./organization-settings-form";

export function OrganizationSettingsView({
  data,
}: {
  data: OrganizationSettingsData;
}) {
  return (
    <>
      <PageHeader
        title="Organization settings"
        description="Manage the identity and workspace defaults that keep your team aligned."
        breadcrumbs={[
          { label: "Workspace", href: "/dashboard" },
          { label: "Administration" },
          { label: "Organization" },
        ]}
        actions={<Badge variant="positive">Owner access</Badge>}
      />
      <OrganizationSettingsForm data={data} />
    </>
  );
}
