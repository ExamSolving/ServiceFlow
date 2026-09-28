import type { Metadata } from "next";
import { requirePermission } from "@/src/lib/auth/authorization";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { DashboardView } from "@/src/features/dashboard/components/dashboard-view";
import { getDashboard } from "@/src/features/dashboard/services/dashboard.service";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("viewDashboard");
  const params = await searchParams;
  const { data } = await getDashboard(params);
  const firstName = session.displayName.trim().split(/\s+/)[0];
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${firstName ? `Welcome back, ${firstName}.` : "Welcome back."} Here’s your workspace at a glance.`}
        breadcrumbs={[{ label: "Workspace" }, { label: "Dashboard" }]}
      />
      <DashboardView data={data} />
    </>
  );
}
