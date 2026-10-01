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
import type { ServiceRequestListData } from "../types/service-request";
import { formatRequestDate, ServiceRequestPriority, serviceRequestPriorityOptions, ServiceRequestStatus, serviceRequestStatusOptions } from "./service-request-status";

const selectStyle = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function requestHref(id: string) {
  return `/service-requests/${encodeURIComponent(id)}`;
}

function pageHref(data: ServiceRequestListData, cursor?: string) {
  const query = new URLSearchParams();
  if (data.filters.q) query.set("q", data.filters.q);
  if (data.filters.status !== "ALL") query.set("status", data.filters.status);
  if (data.filters.priority !== "ALL") query.set("priority", data.filters.priority);
  if (cursor) query.set("cursor", cursor);
  return `/service-requests${query.size ? `?${query.toString()}` : ""}`;
}

export function ServiceRequestsView({ data }: { data: ServiceRequestListData }) {
  const filtered = Boolean(data.filters.q || data.filters.status !== "ALL" || data.filters.priority !== "ALL");
  const ordering = data.filters.q ? "ordered by title" : "newest first";

  return (
    <>
      <PageHeader
        title="Service requests"
        description="Capture what customers are asking for, then review and prioritize the work before it becomes a job."
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Service requests" }]}
        actions={<Link href="/service-requests/new" className={buttonVariants()}><Plus aria-hidden="true" />New request</Link>}
      />
      <Card className="gap-0 py-0">
        <section aria-labelledby="service-request-queue-heading">
          <div className="border-b border-border p-4 sm:p-5">
            <SectionHeading id="service-request-queue-heading" title="Request queue" description="Search by the beginning of a request title, or narrow by status and priority." />
            <Form action="/service-requests" className="mt-5 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]">
              <div className="min-w-0 space-y-2 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="service-request-search">Request title</Label>
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 z-10 size-4 text-muted-foreground" />
                  <Input key={data.filters.q} id="service-request-search" name="q" type="search" defaultValue={data.filters.q} maxLength={160} placeholder="Search by title…" className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="service-request-status-filter">Status</Label>
                <select key={data.filters.status} id="service-request-status-filter" name="status" defaultValue={data.filters.status} className={selectStyle}>
                  <option value="ALL">All statuses</option>
                  {serviceRequestStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="service-request-priority-filter">Priority</Label>
                <select key={data.filters.priority} id="service-request-priority-filter" name="priority" defaultValue={data.filters.priority} className={selectStyle}>
                  <option value="ALL">All priorities</option>
                  {serviceRequestPriorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
                <Button type="submit" variant="outline" className="flex-1 sm:flex-none">Apply filters</Button>
                {(filtered || data.filters.cursor || data.filterError) && <Link href="/service-requests" className={buttonVariants({ variant: "ghost" })}>Clear</Link>}
              </div>
            </Form>
          </div>

          {data.filterError && <div className="p-4 pb-0 sm:px-5"><Alert variant="destructive"><AlertTitle>Check your filters</AlertTitle><AlertDescription>{data.filterError}</AlertDescription></Alert></div>}

          {data.requests.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Service requests, {ordering}</caption>
                  <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">Request</th>
                      <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                      <th scope="col" className="px-4 py-3 font-medium">Service type</th>
                      <th scope="col" className="px-4 py-3 font-medium">Priority</th>
                      <th scope="col" className="px-4 py-3 font-medium">Status</th>
                      <th scope="col" className="whitespace-nowrap px-4 py-3 font-medium">Requested</th>
                      <th scope="col" className="px-5 py-3"><span className="sr-only">Open request</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.requests.map((request) => (
                      <tr key={request.id} className="transition-colors hover:bg-muted/25">
                        <th scope="row" className="max-w-72 px-5 py-4 font-normal">
                          <Link href={requestHref(request.id)} className="rounded font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{request.title}</Link>
                        </th>
                        <td className="max-w-56 px-4 py-4"><span className="block break-words">{request.customerName}</span><span className="mt-0.5 block text-xs text-muted-foreground">{request.customerNumber}</span></td>
                        <td className="max-w-48 px-4 py-4 text-xs break-words">{request.serviceTypeName}</td>
                        <td className="px-4 py-4"><ServiceRequestPriority priority={request.priority} /></td>
                        <td className="px-4 py-4"><ServiceRequestStatus status={request.status} /></td>
                        <td className="whitespace-nowrap px-4 py-4 text-xs"><time dateTime={request.requestedAt}>{formatRequestDate(request.requestedAt)}</time></td>
                        <td className="px-5 py-4 text-right"><Link href={requestHref(request.id)} aria-label={`View ${request.title}`} className={buttonVariants({ variant: "ghost", size: "icon" })}><ArrowRight aria-hidden="true" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-border lg:hidden">
                {data.requests.map((request) => (
                  <li key={request.id} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={requestHref(request.id)} className="inline-block rounded py-1 font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{request.title}</Link>
                        <p className="mt-1 text-xs text-muted-foreground break-words">{request.customerName} · {request.serviceTypeName}</p>
                      </div>
                      <ServiceRequestStatus status={request.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <ServiceRequestPriority priority={request.priority} />
                      <span>Requested <time dateTime={request.requestedAt}>{formatRequestDate(request.requestedAt)}</time></span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={filtered ? Search : Inbox}
                title={data.filterError ? "Adjust your filters" : data.filters.cursor ? "You’ve reached the end" : filtered ? "No matching service requests" : "No service requests yet"}
                description={data.filterError ? "Use a valid title, status and priority, or clear the filters to start again." : data.filters.cursor ? "Return to the first page to see your service requests." : filtered ? "Try a different title, status or priority to find the request you need." : "Log the first request from a customer so your team can review and schedule it."}
                className="min-h-64"
              />
              {!filtered && !data.filters.cursor && !data.filterError && <div className="mt-4 flex justify-center"><Link href="/service-requests/new" className={buttonVariants()}><Plus aria-hidden="true" />Log your first request</Link></div>}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-muted-foreground">{data.requests.length} {data.requests.length === 1 ? "request" : "requests"} on this page{data.nextCursor ? " · More available" : ""} · Dates shown in UTC</p>
            <nav aria-label="Service request pages" className="flex flex-wrap gap-2">
              {data.filters.cursor && <Link href={pageHref(data)} className={buttonVariants({ variant: "outline" })}>First page</Link>}
              {data.nextCursor && <Link href={pageHref(data, data.nextCursor)} className={buttonVariants({ variant: "outline" })}>Next page<ArrowRight aria-hidden="true" /></Link>}
            </nav>
          </div>
        </section>
      </Card>
    </>
  );
}
