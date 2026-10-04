import Link from "next/link";
import { Building2, UsersRound } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import type { WorkspaceSettingsData } from "../types/workspace-settings";
import { WorkspaceSettingsForm } from "./workspace-settings-form";

export function WorkspaceSettingsView({ data }: { data: WorkspaceSettingsData }) {
  return (
    <>
      <PageHeader
        title="Settings"
        description={`Workspace preferences for ${data.organizationName || "your organization"}: billing defaults and working hours.`}
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Administration" }, { label: "Settings" }]}
        actions={<>
          <Link href="/settings/organization" className={buttonVariants({ variant: "outline" })}><Building2 aria-hidden="true" />Organization</Link>
          <Link href="/settings/team" className={buttonVariants({ variant: "outline" })}><UsersRound aria-hidden="true" />Team</Link>
        </>}
      />
      <WorkspaceSettingsForm data={data} />
    </>
  );
}
