import Link from "next/link";
import { ArrowUpRight, CalendarClock, FileText, History, MessageSquare, Pencil, Receipt, UserRound } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { InvoiceStatusBadge, QuotationStatusBadge } from "@/src/features/billing/components/document-status";
import { formatMoney } from "@/src/lib/billing/money";
import { formatDateTime } from "@/src/features/dashboard/components/dashboard-format";
import { jobStatusLabel } from "@/src/features/dashboard/components/dashboard-format";
import type { JobActivity, JobContext } from "../types/job";
import { canDispatchJob, canEditJob } from "../utils/job-workflow";
import { JobActions } from "./job-actions";
import { JobDispatchForm } from "./job-dispatch-form";
import { JobNoteForm } from "./job-notes";
import { JobPriority, JobStatus, formatJobDate } from "./job-status";

function describeActivity(entry: JobActivity): string {
  const meta = entry.metadata;
  const text = (key: string) => (typeof meta[key] === "string" ? String(meta[key]) : null);
  switch (entry.action) {
    case "JOB_CREATED": return `Job created${text("jobNumber") ? ` as ${text("jobNumber")}` : ""}${text("serviceRequestId") ? " from a service request" : ""}.`;
    case "JOB_UPDATED": return `Details updated${Array.isArray(meta.changedFields) ? ` (${(meta.changedFields as string[]).join(", ")})` : ""}.`;
    case "JOB_DISPATCHED": return `Dispatched${text("to") ? ` · ${jobStatusLabel(text("to") as Parameters<typeof jobStatusLabel>[0])}` : ""}${text("scheduledAt") ? " with a visit time" : " without a visit time"}.`;
    case "JOB_STATUS_CHANGED": return `Status changed${text("from") ? ` from ${jobStatusLabel(text("from") as Parameters<typeof jobStatusLabel>[0])}` : ""}${text("to") ? ` to ${jobStatusLabel(text("to") as Parameters<typeof jobStatusLabel>[0])}` : ""}${text("note") ? ` — ${text("note")}` : ""}.`;
    default: return entry.action.toLowerCase().replace(/_/g, " ");
  }
}

const QUOTE_STATUSES = ["DIAGNOSING", "QUOTATION_REQUIRED", "WAITING_APPROVAL", "APPROVED", "ON_HOLD", "IN_PROGRESS"] as const;
const INVOICE_STATUSES = ["COMPLETED", "INVOICED", "PARTIAL"] as const;

function JobBillingCard({ context }: { context: JobContext }) {
  const { job, billing } = context;
  const canQuote = billing.canQuote && (QUOTE_STATUSES as readonly string[]).includes(job.status);
  const canInvoice = billing.canInvoice && (INVOICE_STATUSES as readonly string[]).includes(job.status);
  const empty = !billing.quotations.length && !billing.invoices.length;
  return (
    <Card><CardHeader className="border-b border-border"><SectionHeading title="Billing" description="Quotations and invoices raised for this job." action={<Receipt aria-hidden="true" className="size-4 text-muted-foreground" />} /></CardHeader><CardContent className="space-y-4">
      {billing.unavailable && <p role="status" className="text-xs leading-5 text-destructive">Billing documents couldn’t be loaded. Refresh to try again.</p>}
      {(canQuote || canInvoice) && <div className="flex flex-wrap gap-2">
        {canQuote && <Link href={`/quotations/new?jobId=${encodeURIComponent(job.id)}`} className={buttonVariants({ variant: "outline", size: "sm" })}><FileText aria-hidden="true" />New quotation</Link>}
        {canInvoice && <Link href={`/invoices/new?jobId=${encodeURIComponent(job.id)}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Receipt aria-hidden="true" />New invoice</Link>}
      </div>}
      {empty && !billing.unavailable ? <p className="text-xs leading-5 text-muted-foreground">{job.status === "COMPLETED" ? "The job is complete and ready to invoice." : "No quotations or invoices yet. Quotes are usually raised after diagnosis; invoices once the job is completed."}</p> : (
        <ul className="divide-y divide-border text-sm">
          {billing.quotations.map((quotation) => <li key={quotation.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"><div className="min-w-0"><Link href={`/quotations/${encodeURIComponent(quotation.id)}`} className="rounded font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{quotation.quotationNumber}</Link><p className="text-xs text-muted-foreground">Quotation · {formatMoney(quotation.total, quotation.currency)}</p></div><QuotationStatusBadge status={quotation.status} /></li>)}
          {billing.invoices.map((invoice) => <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"><div className="min-w-0"><Link href={`/invoices/${encodeURIComponent(invoice.id)}`} className="rounded font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{invoice.invoiceNumber}</Link><p className="text-xs text-muted-foreground">Invoice · {formatMoney(invoice.total, invoice.currency)}{invoice.status === "ISSUED" || invoice.status === "PARTIALLY_PAID" ? ` · ${formatMoney(invoice.balanceDue, invoice.currency)} due` : ""}</p></div><InvoiceStatusBadge status={invoice.status} /></li>)}
        </ul>
      )}
    </CardContent></Card>
  );
}

export function JobDetailView({ context }: { context: JobContext }) {
  const { job, notes, activity, timezone } = context;
  return <>
    <PageHeader title={job.title} description={job.jobNumber} breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Jobs", href: "/jobs" }, { label: job.jobNumber }]}
      actions={<>
        {job.scheduledAt && <Link href={`/schedule?date=${job.scheduledAt.slice(0, 10)}`} className={buttonVariants({ variant: "outline" })}><CalendarClock aria-hidden="true" />View in schedule</Link>}
        {canEditJob(job.status) && <Link href={`/jobs/${job.id}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil aria-hidden="true" />Edit job</Link>}
      </>} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
      <div className="min-w-0 space-y-5">
        <Card><CardHeader className="border-b border-border"><SectionHeading title="Work details" action={<JobPriority priority={job.priority} />} /></CardHeader><CardContent><dl className="grid gap-6 sm:grid-cols-2">
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">Customer</dt><dd className="mt-2 break-words text-sm"><Link href={`/customers/${job.customerId}`} className="inline-flex items-center gap-1 rounded font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{job.customerName}<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link><span className="mt-1 block text-xs text-muted-foreground">{job.customerNumber}</span></dd></div>
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">Service type</dt><dd className="mt-2 break-words text-sm">{job.serviceTypeName}{job.estimatedDurationMinutes && <span className="mt-1 block text-xs text-muted-foreground">About {job.estimatedDurationMinutes} min</span>}</dd></div>
          <div className="min-w-0 border-t border-border pt-5 sm:col-span-2"><dt className="text-xs text-muted-foreground">Service location</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{job.serviceAddress}</dd></div>
          <div className="min-w-0 border-t border-border pt-5 sm:col-span-2"><dt className="text-xs text-muted-foreground">Description</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{job.description}</dd></div>
          {job.serviceRequestId && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Source</dt><dd className="mt-2 text-sm"><Link href={`/service-requests/${job.serviceRequestId}`} className="text-primary underline">View original service request</Link></dd></div>}
        </dl><p className="mt-6 text-xs text-muted-foreground">Customer and service type names are captured when the job is created.</p></CardContent></Card>

        <Card><CardHeader className="border-b border-border"><SectionHeading title="Dispatch" description={canDispatchJob(job.status) ? `Assign a technician and set the visit time. Times are in ${timezone}.` : "Assignment is locked once field work starts."} action={<UserRound aria-hidden="true" className="size-4 text-muted-foreground" />} /></CardHeader><CardContent className="space-y-5">
          <dl className="grid gap-4 sm:grid-cols-2 text-sm">
            <div><dt className="text-xs text-muted-foreground">Technician</dt><dd className="mt-1 font-medium">{job.assignedTechnicianId ? <Link href={`/technicians/${job.assignedTechnicianId}`} className="hover:text-primary">{job.assignedTechnicianName ?? "Assigned"}</Link> : <span className="font-normal text-muted-foreground">Unassigned</span>}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Visit</dt><dd className="mt-1 font-medium">{job.scheduledAt ? <time dateTime={job.scheduledAt}>{formatDateTime(job.scheduledAt, timezone)}</time> : <span className="font-normal text-muted-foreground">Not scheduled</span>}</dd></div>
          </dl>
          <JobDispatchForm key={`${job.id}:${job.version}`} job={job} timezone={timezone} />
        </CardContent></Card>

        <Card><CardHeader className="border-b border-border"><SectionHeading title="Notes" description="Internal notes for your team. Not visible to customers." action={<MessageSquare aria-hidden="true" className="size-4 text-muted-foreground" />} /></CardHeader><CardContent className="space-y-5">
          <JobNoteForm jobId={job.id} />
          {notes.length ? (
            <ul className="divide-y divide-border">
              {notes.map((note) => <li key={note.id} className="py-3 first:pt-0 last:pb-0"><p className="whitespace-pre-wrap break-words text-sm leading-6">{note.body}</p><p className="mt-1 text-xs text-muted-foreground">{note.authorName || "Team member"} · <time dateTime={note.createdAt}>{formatDateTime(note.createdAt, timezone)}</time></p></li>)}
            </ul>
          ) : <EmptyState icon={MessageSquare} title="No notes yet" description="Notes you add will appear here, newest first." className="min-h-28" />}
        </CardContent></Card>
      </div>

      <div className="space-y-5">
        <Card><CardHeader className="border-b border-border"><SectionHeading title="Job status" action={<JobStatus status={job.status} />} /></CardHeader><CardContent className="space-y-5">
          <JobActions key={`${job.id}:${job.version}`} job={job} />
          <dl className="space-y-4 border-t border-border pt-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">Created</dt><dd className="mt-1"><time dateTime={job.createdAt}>{formatJobDate(job.createdAt)}</time></dd></div>
            <div><dt className="text-xs text-muted-foreground">Last updated</dt><dd className="mt-1"><time dateTime={job.updatedAt}>{formatJobDate(job.updatedAt)}</time></dd></div>
            {job.completedAt && <div><dt className="text-xs text-muted-foreground">Completed</dt><dd className="mt-1"><time dateTime={job.completedAt}>{formatDateTime(job.completedAt, timezone)}</time></dd></div>}
          </dl>
          <p className="text-xs text-muted-foreground">Record dates in UTC; visit times in {timezone}.</p>
        </CardContent></Card>

        <JobBillingCard context={context} />

        <Card><CardHeader className="border-b border-border"><SectionHeading title="Activity" description="Audit trail for this job." action={<History aria-hidden="true" className="size-4 text-muted-foreground" />} /></CardHeader><CardContent>
          {activity.length ? (
            <ol className="space-y-3">
              {activity.map((entry) => <li key={entry.id} className="flex gap-3 text-sm"><span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" /><div className="min-w-0"><p className="break-words leading-6">{describeActivity(entry)}</p><p className="text-xs text-muted-foreground"><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt, timezone)}</time></p></div></li>)}
            </ol>
          ) : <EmptyState icon={History} title="No activity yet" description="Changes to this job will be listed here." className="min-h-28" />}
        </CardContent></Card>
      </div>
    </div>
  </>;
}
