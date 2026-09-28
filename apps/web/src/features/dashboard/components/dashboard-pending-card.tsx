import { CircleCheck, Clock3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import type { DashboardOperations } from "../types/dashboard";
import { DashboardEmptyState } from "./dashboard-state";

export function DashboardPendingCard({
  operations,
}: {
  operations: DashboardOperations;
}) {
  const items = [
    { label: "New jobs", value: operations.newJobs },
    { label: "Awaiting approval", value: operations.waitingApproval },
    { label: "On hold", value: operations.onHold },
  ].filter((item) => item.value > 0);

  return (
    <Card className="p-5 sm:p-6">
      <section aria-labelledby="pending-heading">
        <div className="mb-5">
          <SectionHeading
            id="pending-heading"
            title="Pending actions"
            description="Items that may need attention"
            action={
              <Clock3
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            }
          />
        </div>
        {items.length ? (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.label}
                className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/50 px-3 py-2.5"
              >
                <span className="text-xs text-muted-foreground">
                  {item.label}
                </span>
                <span className="font-heading text-sm font-semibold">
                  {item.value}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <DashboardEmptyState
            title="You’re all caught up"
            description="No pending job actions were found for this workspace."
          />
        )}
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CircleCheck className="size-3.5 text-primary" aria-hidden="true" />
          Operational counts are tenant-scoped.
        </p>
      </section>
    </Card>
  );
}
