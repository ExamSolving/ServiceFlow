import { CalendarDays, ChevronLeft, ChevronRight, Inbox, UserRound } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { formatTime, technicianStatusLabel } from "@/src/features/dashboard/components/dashboard-format";
import type { TechnicianStatus } from "@/src/features/dashboard/types/dashboard";
import { JobPriority, JobStatus } from "@/src/features/jobs/components/job-status";
import type { JobDetail } from "@/src/features/jobs/types/job";
import type { ScheduleData } from "../types/schedule";

const selectStyle = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function href(data: ScheduleData, changes: Partial<{ date: string; view: string; technician: string }>) {
  const query = new URLSearchParams();
  const date = changes.date ?? data.date;
  const view = changes.view ?? data.view;
  const technician = changes.technician ?? data.technicianFilter;
  query.set("date", date);
  if (view !== "day") query.set("view", view);
  if (technician !== "ALL") query.set("technician", technician);
  return `/schedule?${query.toString()}`;
}

function JobChip({ job, timezone, showTechnician }: { job: JobDetail; timezone: string; showTechnician: boolean }) {
  return (
    <li>
      <Link href={`/jobs/${encodeURIComponent(job.id)}`} className="flex flex-col gap-1 rounded-lg border border-border/70 bg-card px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring">
        <span className="flex flex-wrap items-center gap-2"><span className="font-heading text-xs font-semibold text-primary">{formatTime(job.scheduledAt, timezone)}</span><JobStatus status={job.status} /><JobPriority priority={job.priority} /></span>
        <span className="font-medium break-words">{job.title}</span>
        <span className="text-xs text-muted-foreground break-words">{job.jobNumber} · {job.customerName}{showTechnician ? ` · ${job.assignedTechnicianName ?? "Unassigned"}` : ""}{job.estimatedDurationMinutes ? ` · ~${job.estimatedDurationMinutes} min` : ""}</span>
      </Link>
    </li>
  );
}

export function ScheduleView({ data }: { data: ScheduleData }) {
  const filtered = data.technicianFilter !== "ALL";
  return (
    <>
      <PageHeader
        title="Schedule"
        description={`Visits by technician in ${data.timezone}. Working hours ${data.businessHours.start}–${data.businessHours.end}.`}
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Operations" }, { label: "Schedule" }]}
        actions={<Link href="/jobs/new" className={buttonVariants({ variant: "outline" })}>New job</Link>}
      />
      <div className="space-y-5">
        <Card className="p-3 sm:p-4">
          <Form action="/schedule" className="grid items-end gap-3 lg:grid-cols-[auto_minmax(0,1fr)_10rem_14rem_auto]">
            <div className="flex items-center gap-1">
              <Link href={href(data, { date: data.previousDate })} aria-label={data.view === "week" ? "Previous week" : "Previous day"} className={buttonVariants({ variant: "outline", size: "icon" })}><ChevronLeft aria-hidden="true" /></Link>
              <Link href={href(data, { date: data.today })} className={buttonVariants({ variant: "ghost" })}>Today</Link>
              <Link href={href(data, { date: data.nextDate })} aria-label={data.view === "week" ? "Next week" : "Next day"} className={buttonVariants({ variant: "outline", size: "icon" })}><ChevronRight aria-hidden="true" /></Link>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-date" className="text-xs">Date</Label>
              <div className="relative"><CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input key={data.date} id="schedule-date" name="date" type="date" defaultValue={data.date} min="2000-01-01" max="2100-12-31" className="pl-9" /></div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-view" className="text-xs">View</Label>
              <select key={data.view} id="schedule-view" name="view" defaultValue={data.view} className={selectStyle}><option value="day">Day</option><option value="week">Week</option></select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-technician" className="text-xs">Technician</Label>
              <select key={data.technicianFilter} id="schedule-technician" name="technician" defaultValue={data.technicianFilter} className={selectStyle}>
                <option value="ALL">All technicians</option>
                {data.technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.displayName}</option>)}
              </select>
            </div>
            <div className="flex gap-2"><Button type="submit" variant="outline">Apply</Button>{filtered && <Link href={href(data, { technician: "ALL" })} className={buttonVariants({ variant: "ghost" })}>Clear</Link>}</div>
          </Form>
        </Card>

        {data.filterError && <Alert variant="destructive"><AlertTitle>Check the schedule filters</AlertTitle><AlertDescription>{data.filterError}</AlertDescription></Alert>}

        <Card className="gap-0 py-0">
          <div className="border-b border-border p-4 sm:p-5"><SectionHeading title={data.rangeLabel} description={`${data.totalScheduled} scheduled ${data.totalScheduled === 1 ? "visit" : "visits"}${filtered ? " for the selected technician" : ""}`} /></div>
          {data.view === "day" ? (
            data.lanes.length ? (
              <ul className="divide-y divide-border">
                {data.lanes.map((lane) => (
                  <li key={lane.technician?.id ?? "unassigned"} className="grid gap-3 p-4 sm:p-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><UserRound className="size-4" aria-hidden="true" /></span>
                      <div className="min-w-0">
                        <p className="font-medium break-words">{lane.technician ? <Link href={`/technicians/${lane.technician.id}`} className="hover:text-primary">{lane.technician.displayName}</Link> : "Unassigned visits"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{lane.technician ? technicianStatusLabel(lane.technician.status as TechnicianStatus) : "Jobs with a time but no active technician"} · {lane.jobs.length} {lane.jobs.length === 1 ? "visit" : "visits"}</p>
                      </div>
                    </div>
                    {lane.jobs.length ? <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{lane.jobs.map((job) => <JobChip key={job.id} job={job} timezone={data.timezone} showTechnician={false} />)}</ul> : <p className="self-center text-xs text-muted-foreground">No visits on this day.</p>}
                  </li>
                ))}
              </ul>
            ) : <div className="p-4 sm:p-5"><EmptyState icon={UserRound} title="No technicians to schedule" description="Add technician profiles from the Technicians page, then dispatch jobs to them." className="min-h-40" /></div>
          ) : (
            <div className="grid divide-y divide-border lg:grid-cols-7 lg:divide-x lg:divide-y-0">
              {data.days.map((day) => (
                <section key={day.date} aria-label={day.label} className="min-w-0 p-3">
                  <Link href={href(data, { date: day.date, view: "day" })} className={`flex items-center justify-between rounded-md px-2 py-1 text-xs font-medium hover:bg-muted/60 ${day.isToday ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}>{day.label}<Badge variant={day.jobs.length ? "info" : "outline"}>{day.jobs.length}</Badge></Link>
                  {day.jobs.length ? <ul className="mt-2 space-y-2">{day.jobs.map((job) => <JobChip key={job.id} job={job} timezone={data.timezone} showTechnician />)}</ul> : <p className="mt-3 px-2 text-xs text-muted-foreground">—</p>}
                </section>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Unscheduled backlog" description="Open jobs without a visit time, newest first. Open a job to dispatch it." action={<Inbox aria-hidden="true" className="size-4 text-muted-foreground" />} /></CardHeader>
          <CardContent>
            {data.backlog.length ? (
              <ul className="divide-y divide-border">
                {data.backlog.map((job) => (
                  <li key={job.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0"><Link href={`/jobs/${encodeURIComponent(job.id)}`} className="font-medium break-words hover:text-primary">{job.title}</Link><p className="mt-1 text-xs text-muted-foreground">{job.jobNumber} · {job.customerName}{job.assignedTechnicianName ? ` · ${job.assignedTechnicianName}` : " · Unassigned"}</p></div>
                    <div className="flex flex-wrap items-center gap-2"><JobPriority priority={job.priority} /><JobStatus status={job.status} /><Link href={`/jobs/${encodeURIComponent(job.id)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Dispatch</Link></div>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={Inbox} title="Nothing waiting" description="Every open job has a visit time." className="min-h-28" />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
