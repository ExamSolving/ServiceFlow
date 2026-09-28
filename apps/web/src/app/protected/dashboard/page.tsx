import type { Metadata } from "next";
import { requirePermission } from "@/src/lib/auth/authorization";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { WorkspaceWelcome } from "@/src/features/dashboard/components/workspace-welcome";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requirePermission("viewDashboard");
  const firstName = session.displayName.trim().split(/\s+/)[0];
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${firstName ? `Welcome back, ${firstName}.` : "Welcome back."} Here’s your workspace at a glance.`}
        breadcrumbs={[{ label: "Workspace" }, { label: "Dashboard" }]}
      />
      <WorkspaceWelcome identity={session} />
    </>
  );
}
