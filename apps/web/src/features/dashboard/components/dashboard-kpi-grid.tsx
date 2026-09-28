import { Activity, CalendarCheck2, ClipboardList, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DashboardData } from "../types/dashboard";

function Kpi({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 font-heading text-3xl font-semibold tracking-tight">
            {value}
          </p>
        </div>
        <span className="grid size-9 place-items-center rounded-lg bg-secondary text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{detail}</p>
    </Card>
  );
}

export function DashboardKpiGrid({ data }: { data: DashboardData }) {
  const operations = data.operations?.status === "ready" ? data.operations.data : null;
  const team = data.team?.status === "ready" ? data.team.data : null;
  const requests = data.requests?.status === "ready" ? data.requests.data : null;
  const failed = [data.operations, data.team, data.requests].filter(
    (section) => section?.status === "error",
  ).length;

  if (!operations && !team && !requests && !data.finance) return null;

  return (
    <section aria-labelledby="dashboard-kpis-heading">
      <h2 id="dashboard-kpis-heading" className="sr-only">
        Workspace summary
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {operations && (
          <Kpi
            label={
              operations.scope === "assigned"
                ? "My scheduled jobs"
                : "Scheduled jobs"
            }
            value={operations.todayJobs}
            detail="For your selected date"
            icon={CalendarCheck2}
          />
        )}
        {team && (
          <Kpi
            label="Tracked technicians"
            value={team.activeCount}
            detail="Available, busy, offline or on leave"
            icon={UsersRound}
          />
        )}
        {requests && (
          <Kpi
            label="Open requests"
            value={requests.openCount}
            detail="New or under review"
            icon={ClipboardList}
          />
        )}
        {data.finance?.status === "unavailable" && (
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Billing snapshot
                </p>
                <p className="mt-3 font-heading text-3xl font-semibold tracking-tight">
                  —
                </p>
              </div>
              <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Activity className="size-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Available after billing setup
            </p>
          </Card>
        )}
      </div>
      {failed > 0 && (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          Some summary data is unavailable. Details are shown in the relevant
          sections below.
        </p>
      )}
    </section>
  );
}
