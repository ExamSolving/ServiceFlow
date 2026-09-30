import { ArrowRight, ClipboardList, Plus, Search } from "lucide-react";
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
import type { ServiceTypeListData } from "../types/service-type";
import { formatServiceDuration, ServiceTypeStatus } from "./service-type-status";

const selectStyle = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function serviceTypeHref(id: string) {
  return `/service-types/${encodeURIComponent(id)}`;
}

function pageHref(data: ServiceTypeListData, cursor?: string) {
  const query = new URLSearchParams();
  if (data.filters.q) query.set("q", data.filters.q);
  if (data.filters.status !== "ALL") query.set("status", data.filters.status);
  if (cursor) query.set("cursor", cursor);
  return `/service-types${query.size ? `?${query.toString()}` : ""}`;
}

export function ServiceTypesView({ data }: { data: ServiceTypeListData }) {
  const filtered = Boolean(data.filters.q || data.filters.status !== "ALL");

  return (
    <>
      <PageHeader
        title="Service types"
        description="Give your team a clear catalog of the work your business offers."
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Service types" }]}
        actions={<Link href="/service-types/new" className={buttonVariants()}><Plus aria-hidden="true" />Add service type</Link>}
      />
      <Card className="gap-0 py-0">
        <section aria-labelledby="service-type-directory-heading">
          <div className="border-b border-border p-4 sm:p-5">
            <SectionHeading id="service-type-directory-heading" title="Service catalog" description="Search by the beginning of a service type’s name." />
            <Form action="/service-types" className="mt-5 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="service-type-search">Service type name</Label>
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 z-10 size-4 text-muted-foreground" />
                  <Input key={data.filters.q} id="service-type-search" name="q" type="search" defaultValue={data.filters.q} maxLength={120} placeholder="Search by name…" className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="service-type-status-filter">Status</Label>
                <select key={data.filters.status} id="service-type-status-filter" name="status" defaultValue={data.filters.status} className={selectStyle}>
                  <option value="ALL">All service types</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="outline" className="flex-1 sm:flex-none">Apply filters</Button>
                {(filtered || data.filters.cursor || data.filterError) && <Link href="/service-types" className={buttonVariants({ variant: "ghost" })}>Clear</Link>}
              </div>
            </Form>
          </div>

          {data.filterError && <div className="p-4 pb-0 sm:px-5"><Alert variant="destructive"><AlertTitle>Check your filters</AlertTitle><AlertDescription>{data.filterError}</AlertDescription></Alert></div>}

          {data.serviceTypes.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Service types, ordered by name</caption>
                  <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">Service type</th>
                      <th scope="col" className="px-4 py-3 font-medium">Description</th>
                      <th scope="col" className="whitespace-nowrap px-4 py-3 font-medium">Estimated time</th>
                      <th scope="col" className="px-4 py-3 font-medium">Status</th>
                      <th scope="col" className="px-5 py-3"><span className="sr-only">Open service type</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.serviceTypes.map((serviceType) => (
                      <tr key={serviceType.id} className="transition-colors hover:bg-muted/25">
                        <th scope="row" className="max-w-64 px-5 py-4 font-normal">
                          <Link href={serviceTypeHref(serviceType.id)} className="rounded font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{serviceType.name}</Link>
                        </th>
                        <td className="max-w-xs px-4 py-4 text-xs text-muted-foreground"><span className="line-clamp-2 break-words">{serviceType.description || "No description added"}</span></td>
                        <td className="whitespace-nowrap px-4 py-4 text-xs">{formatServiceDuration(serviceType.estimatedDurationMinutes)}</td>
                        <td className="px-4 py-4"><ServiceTypeStatus active={serviceType.isActive} /></td>
                        <td className="px-5 py-4 text-right"><Link href={serviceTypeHref(serviceType.id)} aria-label={`View ${serviceType.name}`} className={buttonVariants({ variant: "ghost", size: "icon" })}><ArrowRight aria-hidden="true" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-border lg:hidden">
                {data.serviceTypes.map((serviceType) => (
                  <li key={serviceType.id} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={serviceTypeHref(serviceType.id)} className="inline-block rounded py-1 font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{serviceType.name}</Link>
                        <p className="mt-1 text-xs text-muted-foreground">Estimated time · {formatServiceDuration(serviceType.estimatedDurationMinutes)}</p>
                      </div>
                      <ServiceTypeStatus active={serviceType.isActive} />
                    </div>
                    {serviceType.description && <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground break-words">{serviceType.description}</p>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={filtered ? Search : ClipboardList}
                title={data.filterError ? "Adjust your filters" : data.filters.cursor ? "You’ve reached the end" : filtered ? "No matching service types" : "Build your service catalog"}
                description={data.filterError ? "Use a valid name and status, or clear the filters to start again." : data.filters.cursor ? "Return to the first page to see your service types." : filtered ? "Try a different name or status to find the service type you need." : "Add the work your team offers, with an estimated duration to help plan each visit."}
                className="min-h-64"
              />
              {!filtered && !data.filters.cursor && !data.filterError && <div className="mt-4 flex justify-center"><Link href="/service-types/new" className={buttonVariants()}><Plus aria-hidden="true" />Add your first service type</Link></div>}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-muted-foreground">{data.serviceTypes.length} {data.serviceTypes.length === 1 ? "service type" : "service types"} on this page{data.nextCursor ? " · More available" : ""}</p>
            <nav aria-label="Service type pages" className="flex flex-wrap gap-2">
              {data.filters.cursor && <Link href={pageHref(data)} className={buttonVariants({ variant: "outline" })}>First page</Link>}
              {data.nextCursor && <Link href={pageHref(data, data.nextCursor)} className={buttonVariants({ variant: "outline" })}>Next page<ArrowRight aria-hidden="true" /></Link>}
            </nav>
          </div>
        </section>
      </Card>
    </>
  );
}
