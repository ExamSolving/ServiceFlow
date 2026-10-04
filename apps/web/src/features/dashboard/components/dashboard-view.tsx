import { Card } from "@/components/ui/card";
import type { DashboardData } from "../types/dashboard";
import { DashboardFilters } from "./dashboard-filters";
import { DashboardFinanceCard } from "./dashboard-finance-card";
import { DashboardJobList } from "./dashboard-job-list";
import { DashboardKpiGrid } from "./dashboard-kpi-grid";
import { DashboardPendingCard } from "./dashboard-pending-card";
import {
  DashboardSectionError,
  DashboardUnavailableState,
} from "./dashboard-state";
import { DashboardTeamCard } from "./dashboard-team-card";
import { formatGeneratedAt } from "./dashboard-format";

function SectionFeedback({
  section,
}: {
  section:
    | { status: "error"; message: string }
    | { status: "unavailable"; message: string }
    | null;
}) {
  if (!section) return null;
  if (section.status === "error") {
    return <DashboardSectionError message={section.message} />;
  }
  return <DashboardUnavailableState message={section.message} />;
}

export function DashboardView({ data }: { data: DashboardData }) {
  const operations =
    data.operations?.status === "ready" ? data.operations.data : null;
  const team = data.team?.status === "ready" ? data.team.data : null;
  const requests =
    data.requests?.status === "ready" ? data.requests.data : null;
  const finance = data.finance?.status === "ready" ? data.finance.data : null;
  const hasOperationalSections = Boolean(
    data.operations || data.team || data.requests || data.finance,
  );
  const recentJobs = operations ? (
    <DashboardJobList
      title="Recent jobs"
      description={
        operations.scope === "assigned"
          ? "Your latest assigned work"
          : "Latest jobs created in this workspace"
      }
      jobs={operations.recentJobs}
      timezone={data.timezone}
      schedule={false}
    />
  ) : null;

  return (
    <div className="space-y-6">
      {data.filterError && (
        <div
          role="status"
          className="rounded-lg border border-accent bg-accent/50 px-4 py-3 text-xs leading-5 text-accent-foreground"
        >
          {data.filterError}
        </div>
      )}
      <DashboardFilters
        date={data.date}
        today={data.today}
        timezone={data.timezone}
        timezoneDefaulted={data.timezoneDefaulted}
      />
      <DashboardKpiGrid data={data} />
      {!hasOperationalSections && (
        <Card className="border-dashed p-8 text-center">
          <section>
            <p className="font-heading text-sm font-semibold tracking-tight">
              Your dashboard is ready for workspace activity.
            </p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted-foreground">
              Operational summaries will appear here when your role has access
              and your organization has jobs, requests, or technicians.
            </p>
          </section>
        </Card>
      )}
      {data.operations?.status !== "ready" && (
        <SectionFeedback section={data.operations} />
      )}
      {data.team?.status !== "ready" && (
        <SectionFeedback section={data.team} />
      )}
      {data.requests?.status !== "ready" && (
        <SectionFeedback section={data.requests} />
      )}
      {data.finance?.status !== "ready" && (
        <SectionFeedback section={data.finance} />
      )}
      {operations && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <DashboardJobList
            title={
              operations.scope === "assigned"
                ? "My schedule"
                : "Today’s schedule"
            }
            description={
              operations.scope === "assigned"
                ? "Your assigned jobs for the selected date"
                : "Scheduled jobs for the selected date"
            }
            jobs={operations.schedule}
            timezone={data.timezone}
            schedule
          />
          <DashboardPendingCard operations={operations} />
        </div>
      )}
      {operations && team ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          {recentJobs}
          <DashboardTeamCard team={team} />
        </div>
      ) : (
        recentJobs
      )}
      {!operations && team && <DashboardTeamCard team={team} />}
      {finance && <DashboardFinanceCard finance={finance} />}
      {requests?.openCount === 0 && operations && (
        <p className="sr-only">There are no open service requests.</p>
      )}
      <p className="text-right text-[11px] text-muted-foreground">
        Updated {formatGeneratedAt(data.generatedAt, data.timezone)} · Read-only
        workspace summary
      </p>
    </div>
  );
}
