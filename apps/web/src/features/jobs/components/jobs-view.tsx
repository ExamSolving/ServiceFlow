import { ArrowRight, Inbox, Plus, Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import type { JobListData } from "../types/job";
import { formatJobDate, JobPriority, jobPriorityOptions, JobStatus, jobStatusOptions } from "./job-status";

const selectStyle = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function requestHref(id: string) {
  return `/jobs/${encodeURIComponent(id)}`;
}

function pageHref(data: JobListData, cursor?: string) {
  const query = new URLSearchParams();
  if (data.filters.q) query.set("q", data.filters.q);
  if (data.filters.status !== "ALL") query.set("status", data.filters.status);
  if (data.filters.priority !== "ALL") query.set("priority", data.filters.priority);
  if (cursor) query.set("cursor", cursor);
  return `/jobs${query.size ? `?${query.toString()}` : ""}`;
}

export function JobsView({ data }: { data: JobListData }) {
  const filtered = Boolean(data.filters.q || data.filters.status !== "ALL" || data.filters.priority !== "ALL");
  const ordering = data.filters.q ? "ordered by title" : "newest first";

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Prepare and track the work your team needs to deliver."
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Jobs" }]}
        actions={<Link href="/jobs/new" className={buttonVariants()}><Plus aria-hidden="true" />New job</Link>}
      />
      <Card className="gap-0 py-0">
        <section aria-labelledby="job-queue-heading">
          <div className="border-b border-border p-4 sm:p-5">
            <SectionHeading id="job-queue-heading" title="Job register" description="Search by the beginning of a job title, or narrow by status and priority." />
            <Form action="/jobs" className="mt-5 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]">
              <div className="min-w-0 space-y-2 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="job-search">Job title</Label>
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 z-10 size-4 text-muted-foreground" />
                  <Input key={data.filters.q} id="job-search" name="q" type="search" defaultValue={data.filters.q} maxLength={160} placeholder="Search by title…" className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="job-status-filter">Status</Label>
                <select key={data.filters.status} id="job-status-filter" name="status" defaultValue={data.filters.status} className={selectStyle}>
                  <option value="ALL">All statuses</option>
                  {jobStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="job-priority-filter">Priority</Label>
                <select key={data.filters.priority} id="job-priority-filter" name="priority" defaultValue={data.filters.priority} className={selectStyle}>
                  <option value="ALL">All priorities</option>
                  {jobPriorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
                <Button type="submit" variant="outline" className="flex-1 sm:flex-none">Apply filters</Button>
                {(filtered || data.filters.cursor || data.filterError) && <Link href="/jobs" className={buttonVariants({ variant: "ghost" })}>Clear</Link>}
              </div>
            </Form>
          </div>

          {data.filterError && <div className="p-4 pb-0 sm:px-5"><Alert variant="destructive"><AlertTitle>Check your filters</AlertTitle><AlertDescription>{data.filterError}</AlertDescription></Alert></div>}

          {data.jobs.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Jobs, {ordering}</caption>
                  <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">Job</th>
                      <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                      <th scope="col" className="px-4 py-3 font-medium">Service type</th>
                      <th scope="col" className="px-4 py-3 font-medium">Priority</th>
                      <th scope="col" className="px-4 py-3 font-medium">Status</th>
                      <th scope="col" className="whitespace-nowrap px-4 py-3 font-medium">Created</th>
                      <th scope="col" className="px-5 py-3"><span className="sr-only">Open job</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.jobs.map((job) => (
                      <tr key={job.id} className="transition-colors hover:bg-muted/25">
                        <th scope="row" className="max-w-72 px-5 py-4 font-normal">
                          <Link href={requestHref(job.id)} className="rounded font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{job.title}<span className="mt-1 block text-xs text-muted-foreground">{job.jobNumber}</span></Link>
                        </th>
                        <td className="max-w-56 px-4 py-4"><span className="block break-words">{job.customerName}</span><span className="mt-0.5 block text-xs text-muted-foreground">{job.customerNumber}</span></td>
                        <td className="max-w-48 px-4 py-4 text-xs break-words">{job.serviceTypeName}</td>
                        <td className="px-4 py-4"><JobPriority priority={job.priority} /></td>
                        <td className="px-4 py-4"><JobStatus status={job.status} /></td>
                        <td className="whitespace-nowrap px-4 py-4 text-xs"><time dateTime={job.createdAt}>{formatJobDate(job.createdAt)}</time></td>
                        <td className="px-5 py-4 text-right"><Link href={requestHref(job.id)} aria-label={`View ${job.title}`} className={buttonVariants({ variant: "ghost", size: "icon" })}><ArrowRight aria-hidden="true" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-border lg:hidden">
                {data.jobs.map((job) => (
                  <li key={job.id} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={requestHref(job.id)} className="inline-block rounded py-1 font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{job.title}</Link>
                        <p className="mt-1 text-xs text-muted-foreground break-words">{job.customerName} · {job.serviceTypeName}</p>
                      </div>
                      <JobStatus status={job.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <JobPriority priority={job.priority} />
                      <span>Created <time dateTime={job.createdAt}>{formatJobDate(job.createdAt)}</time></span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={filtered ? Search : Inbox}
                title={data.filterError ? "Adjust your filters" : data.filters.cursor ? "You’ve reached the end" : filtered ? "No matching jobs" : "No jobs yet"}
                description={data.filterError ? "Use a valid title, status and priority, or clear the filters to start again." : data.filters.cursor ? "Return to the first page to see your jobs." : filtered ? "Try a different title, status or priority to find the job you need." : "Create a job directly or convert a service request."}
                className="min-h-64"
              />
              {!filtered && !data.filters.cursor && !data.filterError && <div className="mt-4 flex justify-center"><Link href="/jobs/new" className={buttonVariants()}><Plus aria-hidden="true" />Create your first job</Link></div>}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-muted-foreground">{data.jobs.length} {data.jobs.length === 1 ? "job" : "jobs"} on this page{data.nextCursor ? " · More available" : ""} · Dates shown in UTC</p>
            <nav aria-label="Job pages" className="flex flex-wrap gap-2">
              {data.filters.cursor && <Link href={pageHref(data)} className={buttonVariants({ variant: "outline" })}>First page</Link>}
              {data.nextCursor && <Link href={pageHref(data, data.nextCursor)} className={buttonVariants({ variant: "outline" })}>Next page<ArrowRight aria-hidden="true" /></Link>}
            </nav>
          </div>
        </section>
      </Card>
    </>
  );
}
