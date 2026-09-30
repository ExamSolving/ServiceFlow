import { ArrowRight, Plus, Search, Wrench } from "lucide-react";
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
import type { TechnicianListData } from "../types/technician";
import { TechnicianStatus, technicianStatuses } from "./technician-status";

const contactLink = "rounded text-muted-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring";
const selectStyle = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function technicianHref(id: string) {
  return `/technicians/${encodeURIComponent(id)}`;
}

function pageHref(data: TechnicianListData, cursor?: string) {
  const query = new URLSearchParams();
  if (data.filters.q) query.set("q", data.filters.q);
  if (data.filters.status !== "ALL") query.set("status", data.filters.status);
  if (cursor) query.set("cursor", cursor);
  return `/technicians${query.size ? `?${query.toString()}` : ""}`;
}

export function TechniciansView({ data }: { data: TechnicianListData }) {
  const filtered = Boolean(data.filters.q || data.filters.status !== "ALL");

  return (
    <>
      <PageHeader title="Technicians" description="Keep your field team’s contact details and availability in one place."
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Technicians" }]}
        actions={<Link href="/technicians/new" className={buttonVariants()}><Plus aria-hidden="true" />Add technician</Link>} />
      <Card className="gap-0 py-0">
        <section aria-labelledby="technician-directory-heading">
          <div className="border-b border-border p-4 sm:p-5">
            <SectionHeading id="technician-directory-heading" title="Technician directory" description="Search by the beginning of a technician’s name." />
            <Form action="/technicians" className="mt-5 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="technician-search">Technician name</Label>
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 z-10 size-4 text-muted-foreground" />
                  <Input key={data.filters.q} id="technician-search" name="q" type="search" defaultValue={data.filters.q} maxLength={120} placeholder="Search by name…" className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="technician-status-filter">Status</Label>
                <select key={data.filters.status} id="technician-status-filter" name="status" defaultValue={data.filters.status} className={selectStyle}>
                  <option value="ALL">All statuses</option>
                  {technicianStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="outline" className="flex-1 sm:flex-none">Apply filters</Button>
                {(filtered || data.filters.cursor || data.filterError) && <Link href="/technicians" className={buttonVariants({ variant: "ghost" })}>Clear</Link>}
              </div>
            </Form>
          </div>
          {data.filterError && <div className="p-4 pb-0 sm:px-5"><Alert variant="destructive"><AlertTitle>Check your filters</AlertTitle><AlertDescription>{data.filterError}</AlertDescription></Alert></div>}
          {data.technicians.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Technician directory, ordered by name</caption>
                  <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">Technician</th>
                      <th scope="col" className="px-4 py-3 font-medium">Phone number</th>
                      <th scope="col" className="px-4 py-3 font-medium">Status</th>
                      <th scope="col" className="px-5 py-3"><span className="sr-only">Open technician</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.technicians.map((technician) => (
                      <tr key={technician.id} className="transition-colors hover:bg-muted/25">
                        <th scope="row" className="max-w-72 px-5 py-4 font-normal">
                          <Link href={technicianHref(technician.id)} className="rounded font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{technician.displayName}</Link>
                          <p className="mt-1 text-xs text-muted-foreground">{technician.employeeNumber}</p>
                        </th>
                        <td className="max-w-64 px-4 py-4">{technician.phone ? <a className={`${contactLink} block w-fit break-all text-xs`} href={`tel:${technician.phone.replace(/[^+\d]/g, "")}`}>{technician.phone}</a> : <span className="text-xs text-muted-foreground">Not added</span>}</td>
                        <td className="px-4 py-4"><TechnicianStatus status={technician.status} /></td>
                        <td className="px-5 py-4 text-right"><Link href={technicianHref(technician.id)} aria-label={`View ${technician.displayName}`} className={buttonVariants({ variant: "ghost", size: "icon" })}><ArrowRight aria-hidden="true" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-border md:hidden">
                {data.technicians.map((technician) => (
                  <li key={technician.id} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={technicianHref(technician.id)} className="inline-block rounded py-1 font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{technician.displayName}</Link>
                        <p className="mt-1 text-xs text-muted-foreground">{technician.employeeNumber}</p>
                      </div>
                      <TechnicianStatus status={technician.status} />
                    </div>
                    <div className="mt-3 text-sm">{technician.phone ? <a href={`tel:${technician.phone.replace(/[^+\d]/g, "")}`} className={`${contactLink} inline-block py-2 break-all`}>{technician.phone}</a> : <p className="py-2 text-xs text-muted-foreground">No phone number added</p>}</div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState icon={filtered ? Search : Wrench}
                title={data.filterError ? "Adjust your filters" : data.filters.cursor ? "You’ve reached the end" : filtered ? "No matching technicians" : "Bring your field team together"}
                description={data.filterError ? "Use a valid name and status, or clear the filters to start again." : data.filters.cursor ? "Return to the first page to see your technicians." : filtered ? "Try a different name or status to find the technician you need." : "Add a technician profile for an existing team member to organize contact details and availability."}
                className="min-h-64" />
              {!filtered && !data.filters.cursor && !data.filterError && <div className="mt-4 flex justify-center"><Link href="/technicians/new" className={buttonVariants()}><Plus aria-hidden="true" />Add your first technician</Link></div>}
            </div>
          )}
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-muted-foreground">{data.technicians.length} {data.technicians.length === 1 ? "technician" : "technicians"} on this page{data.nextCursor ? " · More available" : ""}</p>
            <nav aria-label="Technician pages" className="flex flex-wrap gap-2">
              {data.filters.cursor && <Link href={pageHref(data)} className={buttonVariants({ variant: "outline" })}>First page</Link>}
              {data.nextCursor && <Link href={pageHref(data, data.nextCursor)} className={buttonVariants({ variant: "outline" })}>Next page<ArrowRight aria-hidden="true" /></Link>}
            </nav>
          </div>
        </section>
      </Card>
    </>
  );
}
