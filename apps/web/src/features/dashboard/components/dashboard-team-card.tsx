import { UsersRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import type { DashboardTeam } from "../types/dashboard";
import { technicianStatusClass, technicianStatusLabel } from "./dashboard-format";
import { DashboardEmptyState } from "./dashboard-state";

export function DashboardTeamCard({ team }: { team: DashboardTeam }) {
  return (
    <Card className="p-5 sm:p-6">
      <section aria-labelledby="technician-heading">
        <div className="mb-5">
          <SectionHeading
            id="technician-heading"
            title="Technician availability"
            description={`${team.activeCount} tracked team members`}
            action={
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                <UsersRound className="size-4" aria-hidden="true" />
              </span>
            }
          />
        </div>
        {team.technicians.length ? (
          <ul className="space-y-3">
            {team.technicians.map((technician) => (
              <li key={technician.id} className="flex items-center gap-3">
                <span
                  className={`size-2 shrink-0 rounded-full ${technicianStatusClass(technician.status)}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {technician.displayName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {technicianStatusLabel(technician.status)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <DashboardEmptyState
            title="No technicians yet"
            description="Team availability will appear when technicians are added to this organization."
          />
        )}
      </section>
    </Card>
  );
}
