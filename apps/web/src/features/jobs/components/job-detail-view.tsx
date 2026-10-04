import Link from "next/link";
import { Pencil } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import type { JobDetail } from "../types/job";
import { canEditJob } from "../utils/job-workflow";
import { JobPriority, JobStatus, formatJobDate } from "./job-status";
import { JobActions } from "./job-actions";
export function JobDetailView({ job }: { job: JobDetail }) {
  return <>
    <PageHeader title={job.title} description={job.jobNumber} breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Jobs", href: "/jobs" }, { label: job.jobNumber }]} actions={canEditJob(job.status) ? <Link href={`/jobs/${job.id}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil aria-hidden="true" />Edit job</Link> : undefined} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <Card><CardHeader className="border-b border-border"><SectionHeading title="Work details" action={<JobPriority priority={job.priority} />} /></CardHeader><CardContent><dl className="grid gap-6 sm:grid-cols-2">
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Customer</dt><dd className="mt-2 break-words text-sm"><Link href={`/customers/${job.customerId}`} className="font-medium text-primary underline">{job.customerName}</Link><span className="mt-1 block text-xs text-muted-foreground">{job.customerNumber}</span></dd></div>
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Service type</dt><dd className="mt-2 break-words text-sm">{job.serviceTypeName}</dd></div>
        <div className="min-w-0 border-t border-border pt-5 sm:col-span-2"><dt className="text-xs text-muted-foreground">Service location</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{job.serviceAddress}</dd></div>
        <div className="min-w-0 border-t border-border pt-5 sm:col-span-2"><dt className="text-xs text-muted-foreground">Description</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{job.description}</dd></div>
        {job.serviceRequestId && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Source</dt><dd className="mt-2 text-sm"><Link href={`/service-requests/${job.serviceRequestId}`} className="text-primary underline">View original service request</Link></dd></div>}
      </dl><p className="mt-6 text-xs text-muted-foreground">Customer and service type names are captured when the job is created.</p></CardContent></Card>
      <Card><CardHeader className="border-b border-border"><SectionHeading title="Job status" action={<JobStatus status={job.status} />} /></CardHeader><CardContent className="space-y-5">
        <dl className="space-y-4 text-sm"><div><dt className="text-xs text-muted-foreground">Assignment</dt><dd className="mt-1">{job.assignedTechnicianId ? "Assigned" : "Unassigned"}</dd></div><div><dt className="text-xs text-muted-foreground">Schedule</dt><dd className="mt-1">{job.scheduledAt ? formatJobDate(job.scheduledAt) : "Not scheduled"}</dd></div><div><dt className="text-xs text-muted-foreground">Created</dt><dd className="mt-1"><time dateTime={job.createdAt}>{formatJobDate(job.createdAt)}</time></dd></div><div><dt className="text-xs text-muted-foreground">Last updated</dt><dd className="mt-1"><time dateTime={job.updatedAt}>{formatJobDate(job.updatedAt)}</time></dd></div></dl>
        <p className="text-xs text-muted-foreground">Dates shown in UTC.</p><JobActions key={`${job.id}:${job.version}`} job={job} />
      </CardContent></Card>
    </div>
  </>;
}
