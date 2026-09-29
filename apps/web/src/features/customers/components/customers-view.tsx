import { ArrowRight, Plus, Search, Users } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import type { CustomerDetail, CustomerListData } from "../types/customer";

const contactLink = "rounded text-muted-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring";
const selectStyle = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function customerHref(customer: CustomerDetail) {
  return `/customers/${encodeURIComponent(customer.id)}`;
}

function pageHref(data: CustomerListData, cursor?: string) {
  const query = new URLSearchParams();
  if (data.filters.q) query.set("q", data.filters.q);
  if (data.filters.status !== "ALL") query.set("status", data.filters.status);
  if (cursor) query.set("cursor", cursor);
  return `/customers${query.size ? `?${query.toString()}` : ""}`;
}

function CustomerStatus({ active }: { active: boolean }) {
  return <Badge variant={active ? "positive" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>;
}

export function CustomersView({ data }: { data: CustomerListData }) {
  const filtered = Boolean(data.filters.q || data.filters.status !== "ALL");

  return (
    <>
      <PageHeader
        title="Customers"
        description="Keep your customer details organized and ready for the next service."
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Customers" }]}
        actions={<Link href="/customers/new" className={buttonVariants()}><Plus aria-hidden="true" />Add customer</Link>}
      />

      <Card className="gap-0 py-0">
        <section aria-labelledby="customer-directory-heading">
          <div className="border-b border-border p-4 sm:p-5">
            <SectionHeading id="customer-directory-heading" title="Customer directory" description="Search by the beginning of a customer’s name." />
            <Form action="/customers" className="mt-5 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="customer-search">Customer name</Label>
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 z-10 size-4 text-muted-foreground" />
                  <Input key={data.filters.q} id="customer-search" name="q" type="search" defaultValue={data.filters.q} maxLength={120} placeholder="Search by name…" className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-status-filter">Status</Label>
                <select key={data.filters.status} id="customer-status-filter" name="status" defaultValue={data.filters.status} className={selectStyle}>
                  <option value="ALL">All customers</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="outline" className="flex-1 sm:flex-none">Apply filters</Button>
                {(filtered || data.filters.cursor || data.filterError) && <Link href="/customers" className={buttonVariants({ variant: "ghost" })}>Clear</Link>}
              </div>
            </Form>
          </div>

          {data.filterError && <div className="p-4 pb-0 sm:px-5"><Alert variant="destructive"><AlertTitle>Check your filters</AlertTitle><AlertDescription>{data.filterError}</AlertDescription></Alert></div>}

          {data.customers.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Customer directory, ordered by name</caption>
                  <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">Customer</th>
                      <th scope="col" className="px-4 py-3 font-medium">Contact</th>
                      <th scope="col" className="px-4 py-3 font-medium">Type</th>
                      <th scope="col" className="px-4 py-3 font-medium">Status</th>
                      <th scope="col" className="px-5 py-3"><span className="sr-only">Open customer</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.customers.map((customer) => (
                      <tr key={customer.id} className="transition-colors hover:bg-muted/25">
                        <th scope="row" className="max-w-72 px-5 py-4 font-normal">
                          <Link href={customerHref(customer)} className="rounded font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{customer.name}</Link>
                          <p className="mt-1 text-xs text-muted-foreground">{customer.customerNumber}</p>
                        </th>
                        <td className="max-w-64 px-4 py-4">
                          <a className={`${contactLink} block w-fit break-all text-xs`} href={`tel:${customer.phone.replace(/[^+\d]/g, "")}`}>{customer.phone}</a>
                          {customer.email && <a className={`${contactLink} mt-1 block w-fit break-all text-xs`} href={`mailto:${customer.email}`}>{customer.email}</a>}
                        </td>
                        <td className="px-4 py-4 text-xs text-muted-foreground">{customer.type === "BUSINESS" ? "Business" : "Individual"}</td>
                        <td className="px-4 py-4"><CustomerStatus active={customer.isActive} /></td>
                        <td className="px-5 py-4 text-right"><Link href={customerHref(customer)} aria-label={`View ${customer.name}`} className={buttonVariants({ variant: "ghost", size: "icon" })}><ArrowRight aria-hidden="true" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-border md:hidden">
                {data.customers.map((customer) => (
                  <li key={customer.id} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={customerHref(customer)} className="inline-block rounded py-1 font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{customer.name}</Link>
                        <p className="mt-1 text-xs text-muted-foreground">{customer.customerNumber} · {customer.type === "BUSINESS" ? "Business" : "Individual"}</p>
                      </div>
                      <CustomerStatus active={customer.isActive} />
                    </div>
                    <div className="mt-3 flex flex-col items-start text-sm">
                      <a href={`tel:${customer.phone.replace(/[^+\d]/g, "")}`} className={`${contactLink} py-2 break-all`}>{customer.phone}</a>
                      {customer.email && <a href={`mailto:${customer.email}`} className={`${contactLink} py-2 break-all`}>{customer.email}</a>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={filtered ? Search : Users}
                title={data.filterError ? "Adjust your filters" : data.filters.cursor ? "You’ve reached the end" : filtered ? "No matching customers" : "Your customer directory starts here"}
                description={data.filterError ? "Use a valid name and status, or clear the filters to start again." : data.filters.cursor ? "Return to the first page to see your customers." : filtered ? "Try a different name or status to find the customer you need." : "Add your first customer to keep their contact details and service notes in one place."}
                className="min-h-64"
              />
              {!filtered && !data.filters.cursor && !data.filterError && <div className="mt-4 flex justify-center"><Link href="/customers/new" className={buttonVariants()}><Plus aria-hidden="true" />Add your first customer</Link></div>}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-muted-foreground">{data.customers.length} {data.customers.length === 1 ? "customer" : "customers"} on this page{data.nextCursor ? " · More available" : ""}</p>
            <nav aria-label="Customer pages" className="flex flex-wrap gap-2">
              {data.filters.cursor && <Link href={pageHref(data)} className={buttonVariants({ variant: "outline" })}>First page</Link>}
              {data.nextCursor && <Link href={pageHref(data, data.nextCursor)} className={buttonVariants({ variant: "outline" })}>Next page<ArrowRight aria-hidden="true" /></Link>}
            </nav>
          </div>
        </section>
      </Card>
    </>
  );
}
