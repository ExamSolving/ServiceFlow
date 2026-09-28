import { CalendarClock, ClipboardList, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import type { DashboardJob } from "../types/dashboard";
import {
  formatDateTime,
  formatTime,
  jobStatusLabel,
  jobStatusVariant,
} from "./dashboard-format";
import { DashboardEmptyState } from "./dashboard-state";

function JobRow({
  job,
  timezone,
  schedule,
}: {
  job: DashboardJob;
  timezone: string;
  schedule: boolean;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-border py-4 first:pt-0 last:border-0 last:pb-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <ClipboardList className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{job.title}</p>
          <Badge variant={jobStatusVariant(job.status)}>
            {jobStatusLabel(job.status)}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {job.jobNumber} · {job.priority.toLowerCase()} priority
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3" aria-hidden="true" />
            {schedule
              ? formatTime(job.scheduledAt, timezone)
              : formatDateTime(job.createdAt, timezone)}
          </span>
          {schedule && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" aria-hidden="true" />
              Service appointment
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

export function DashboardJobList({
  title,
  description,
  jobs,
  timezone,
  schedule,
}: {
  title: string;
  description: string;
  jobs: DashboardJob[];
  timezone: string;
  schedule: boolean;
}) {
  const headingId = `${schedule ? "schedule" : "recent"}-heading`;

  return (
    <Card className="p-5 sm:p-6">
      <section aria-labelledby={headingId}>
        <div className="mb-5">
          <SectionHeading
            id={headingId}
            title={title}
            description={description}
            action={
              schedule ? <Badge variant="outline">Up to 12</Badge> : undefined
            }
          />
        </div>
        {jobs.length ? (
          <ul>
            {jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                timezone={timezone}
                schedule={schedule}
              />
            ))}
          </ul>
        ) : (
          <DashboardEmptyState
            title={schedule ? "Nothing scheduled" : "No recent jobs"}
            description={
              schedule
                ? "No jobs are scheduled for this date."
                : "New jobs will appear here when your workspace has activity."
            }
          />
        )}
      </section>
    </Card>
  );
}
