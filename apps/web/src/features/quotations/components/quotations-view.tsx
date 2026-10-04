import { ArrowRight, FileText, Plus, Search } from "lucide-react";
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
import { formatBillingDate, formatCalendarDate, quotationStatusLabel } from "@/src/features/billing/components/billing-format";
import { QuotationStatusBadge } from "@/src/features/billing/components/document-status";
import { formatMoney } from "@/src/lib/billing/money";
import { quotationStatuses } from "../schemas/quotation.schema";
import type { QuotationListData } from "../types/quotation";

const selectStyle = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const href = (id: string) => `/quotations/${encodeURIComponent(id)}`;

function pageHref(data: QuotationListData, cursor?: string) {
  const query = new URLSearchParams();
  if (data.filters.q) query.set("q", data.filters.q);
  if (data.filters.status !== "ALL") query.set("status", data.filters.status);
  if (cursor) query.set("cursor", cursor);
  return `/quotations${query.size ? `?${query.toString()}` : ""}`;
}

export function QuotationsView({ data }: { data: QuotationListData }) {
  const filtered = Boolean(data.filters.q || data.filters.status !== "ALL");
  return <>
    <PageHeader title="Quotations" description="Price work before it starts, send it to the customer, and convert approved quotes into invoices."
      breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Quotations" }]}
      actions={<Link href="/quotations/new" className={buttonVariants()}><Plus aria-hidden="true" />New quotation</Link>} />
    <Card className="gap-0 py-0">
      <section aria-labelledby="quotations-heading">
        <div className="border-b border-border p-4 sm:p-5">
          <SectionHeading id="quotations-heading" title="All quotations" description={data.filters.q ? "Matches are ordered by title." : "Newest first. Search by the beginning of a title."} />
          <Form action="/quotations" className="mt-5 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="quotation-search">Title</Label>
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 z-10 size-4 text-muted-foreground" />
                <Input key={data.filters.q} id="quotation-search" name="q" type="search" defaultValue={data.filters.q} maxLength={120} placeholder="Search by title…" className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quotation-status-filter">Status</Label>
              <select key={data.filters.status} id="quotation-status-filter" name="status" defaultValue={data.filters.status} className={selectStyle}>
                <option value="ALL">All statuses</option>
                {quotationStatuses.map((status) => <option key={status} value={status}>{quotationStatusLabel(status)}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="outline" className="flex-1 sm:flex-none">Apply filters</Button>
              {(filtered || data.filters.cursor || data.filterError) && <Link href="/quotations" className={buttonVariants({ variant: "ghost" })}>Clear</Link>}
            </div>
          </Form>
        </div>
        {data.filterError && <div className="p-4 pb-0 sm:px-5"><Alert variant="destructive"><AlertTitle>Check your filters</AlertTitle><AlertDescription>{data.filterError}</AlertDescription></Alert></div>}
        {data.quotations.length ? <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Quotations</caption>
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr><th scope="col" className="px-5 py-3 font-medium">Quotation</th><th scope="col" className="px-4 py-3 font-medium">Customer</th><th scope="col" className="px-4 py-3 font-medium">Status</th><th scope="col" className="px-4 py-3 font-medium">Valid until</th><th scope="col" className="px-4 py-3 text-right font-medium">Total</th><th scope="col" className="px-5 py-3"><span className="sr-only">Open</span></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.quotations.map((quotation) => (
                  <tr key={quotation.id} className="transition-colors hover:bg-muted/25">
                    <th scope="row" className="max-w-72 px-5 py-4 font-normal"><Link href={href(quotation.id)} className="rounded font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{quotation.title}</Link><span className="mt-1 block font-mono text-xs text-muted-foreground">{quotation.quotationNumber}{quotation.jobNumber ? ` · ${quotation.jobNumber}` : ""}</span></th>
                    <td className="max-w-56 px-4 py-4"><span className="block break-words">{quotation.customerName}</span><span className="text-xs text-muted-foreground">{quotation.customerNumber}</span></td>
                    <td className="px-4 py-4"><QuotationStatusBadge status={quotation.status} expired={quotation.validUntil < data.today} /></td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs">{formatCalendarDate(quotation.validUntil)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-medium tabular-nums">{formatMoney(quotation.total, quotation.currency)}</td>
                    <td className="px-5 py-4 text-right"><Link href={href(quotation.id)} aria-label={`View ${quotation.quotationNumber}`} className={buttonVariants({ variant: "ghost", size: "icon" })}><ArrowRight aria-hidden="true" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-border lg:hidden">
            {data.quotations.map((quotation) => (
              <li key={quotation.id} className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><Link href={href(quotation.id)} className="inline-block rounded py-1 font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{quotation.title}</Link><p className="mt-1 font-mono text-xs text-muted-foreground">{quotation.quotationNumber}</p></div>
                  <QuotationStatusBadge status={quotation.status} expired={quotation.validUntil < data.today} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{quotation.customerName} · {formatMoney(quotation.total, quotation.currency)} · created <time dateTime={quotation.createdAt}>{formatBillingDate(quotation.createdAt)}</time></p>
              </li>
            ))}
          </ul>
        </> : (
          <div className="p-4 sm:p-5">
            <EmptyState icon={filtered ? Search : FileText} title={data.filterError ? "Adjust your filters" : data.filters.cursor ? "You’ve reached the end" : filtered ? "No matching quotations" : "No quotations yet"} description={data.filterError ? "Use valid filters, or clear them to start again." : data.filters.cursor ? "Return to the first page to see your quotations." : filtered ? "Try another title or status." : "Create a quotation from a job that needs pricing, or start one for any customer."} className="min-h-64" />
            {!filtered && !data.filters.cursor && !data.filterError && <div className="mt-4 flex justify-center"><Link href="/quotations/new" className={buttonVariants()}><Plus aria-hidden="true" />Create your first quotation</Link></div>}
          </div>
        )}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-muted-foreground">{data.quotations.length} {data.quotations.length === 1 ? "quotation" : "quotations"} on this page{data.nextCursor ? " · More available" : ""}</p>
          <nav aria-label="Quotation pages" className="flex flex-wrap gap-2">
            {data.filters.cursor && <Link href={pageHref(data)} className={buttonVariants({ variant: "outline" })}>First page</Link>}
            {data.nextCursor && <Link href={pageHref(data, data.nextCursor)} className={buttonVariants({ variant: "outline" })}>Next page<ArrowRight aria-hidden="true" /></Link>}
          </nav>
        </div>
      </section>
    </Card>
  </>;
}
