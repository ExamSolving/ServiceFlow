import { ArrowRight, Plus, Receipt, Search } from "lucide-react";
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
import { formatBillingDate, formatCalendarDate, invoiceStatusLabel } from "@/src/features/billing/components/billing-format";
import { InvoiceStatusBadge } from "@/src/features/billing/components/document-status";
import { formatMoney } from "@/src/lib/billing/money";
import { invoiceStatuses } from "../schemas/invoice.schema";
import type { InvoiceDetail, InvoiceListData } from "../types/invoice";

const selectStyle = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const href = (id: string) => `/invoices/${encodeURIComponent(id)}`;
export const isOverdue = (invoice: Pick<InvoiceDetail, "status" | "dueAt">, today: string) => Boolean(invoice.dueAt && invoice.dueAt < today && (invoice.status === "ISSUED" || invoice.status === "PARTIALLY_PAID"));

function pageHref(data: InvoiceListData, cursor?: string) {
  const query = new URLSearchParams();
  if (data.filters.q) query.set("q", data.filters.q);
  if (data.filters.status !== "ALL") query.set("status", data.filters.status);
  if (cursor) query.set("cursor", cursor);
  return `/invoices${query.size ? `?${query.toString()}` : ""}`;
}

export function InvoicesView({ data }: { data: InvoiceListData }) {
  const filtered = Boolean(data.filters.q || data.filters.status !== "ALL");
  return <>
    <PageHeader title="Invoices" description="Bill completed work, track what is outstanding, and record payments as they arrive."
      breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Invoices" }]}
      actions={<Link href="/invoices/new" className={buttonVariants()}><Plus aria-hidden="true" />New invoice</Link>} />
    <Card className="gap-0 py-0">
      <section aria-labelledby="invoices-heading">
        <div className="border-b border-border p-4 sm:p-5">
          <SectionHeading id="invoices-heading" title="All invoices" description={data.filters.q ? "Matches are ordered by title." : "Newest first. Search by the beginning of a title."} />
          <Form action="/invoices" className="mt-5 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="invoice-search">Title</Label>
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 z-10 size-4 text-muted-foreground" />
                <Input key={data.filters.q} id="invoice-search" name="q" type="search" defaultValue={data.filters.q} maxLength={120} placeholder="Search by title…" className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-status-filter">Status</Label>
              <select key={data.filters.status} id="invoice-status-filter" name="status" defaultValue={data.filters.status} className={selectStyle}>
                <option value="ALL">All statuses</option>
                {invoiceStatuses.map((status) => <option key={status} value={status}>{invoiceStatusLabel(status)}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="outline" className="flex-1 sm:flex-none">Apply filters</Button>
              {(filtered || data.filters.cursor || data.filterError) && <Link href="/invoices" className={buttonVariants({ variant: "ghost" })}>Clear</Link>}
            </div>
          </Form>
        </div>
        {data.filterError && <div className="p-4 pb-0 sm:px-5"><Alert variant="destructive"><AlertTitle>Check your filters</AlertTitle><AlertDescription>{data.filterError}</AlertDescription></Alert></div>}
        {data.invoices.length ? <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Invoices</caption>
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr><th scope="col" className="px-5 py-3 font-medium">Invoice</th><th scope="col" className="px-4 py-3 font-medium">Customer</th><th scope="col" className="px-4 py-3 font-medium">Status</th><th scope="col" className="px-4 py-3 font-medium">Due</th><th scope="col" className="px-4 py-3 text-right font-medium">Total</th><th scope="col" className="px-4 py-3 text-right font-medium">Balance</th><th scope="col" className="px-5 py-3"><span className="sr-only">Open</span></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id} className="transition-colors hover:bg-muted/25">
                    <th scope="row" className="max-w-72 px-5 py-4 font-normal"><Link href={href(invoice.id)} className="rounded font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{invoice.title}</Link><span className="mt-1 block font-mono text-xs text-muted-foreground">{invoice.invoiceNumber}{invoice.jobNumber ? ` · ${invoice.jobNumber}` : ""}</span></th>
                    <td className="max-w-56 px-4 py-4"><span className="block break-words">{invoice.customerName}</span><span className="text-xs text-muted-foreground">{invoice.customerNumber}</span></td>
                    <td className="px-4 py-4"><InvoiceStatusBadge status={invoice.status} overdue={isOverdue(invoice, data.today)} /></td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs">{invoice.dueAt ? formatCalendarDate(invoice.dueAt) : <span className="text-muted-foreground">Set on issue</span>}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">{formatMoney(invoice.total, invoice.currency)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-medium tabular-nums">{invoice.status === "DRAFT" || invoice.status === "VOID" ? <span className="font-normal text-muted-foreground">—</span> : formatMoney(invoice.balanceDue, invoice.currency)}</td>
                    <td className="px-5 py-4 text-right"><Link href={href(invoice.id)} aria-label={`View ${invoice.invoiceNumber}`} className={buttonVariants({ variant: "ghost", size: "icon" })}><ArrowRight aria-hidden="true" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-border lg:hidden">
            {data.invoices.map((invoice) => (
              <li key={invoice.id} className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><Link href={href(invoice.id)} className="inline-block rounded py-1 font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{invoice.title}</Link><p className="mt-1 font-mono text-xs text-muted-foreground">{invoice.invoiceNumber}</p></div>
                  <InvoiceStatusBadge status={invoice.status} overdue={isOverdue(invoice, data.today)} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{invoice.customerName} · {formatMoney(invoice.total, invoice.currency)}{invoice.status !== "DRAFT" && invoice.status !== "VOID" ? ` · ${formatMoney(invoice.balanceDue, invoice.currency)} due` : ""} · created <time dateTime={invoice.createdAt}>{formatBillingDate(invoice.createdAt)}</time></p>
              </li>
            ))}
          </ul>
        </> : (
          <div className="p-4 sm:p-5">
            <EmptyState icon={filtered ? Search : Receipt} title={data.filterError ? "Adjust your filters" : data.filters.cursor ? "You’ve reached the end" : filtered ? "No matching invoices" : "No invoices yet"} description={data.filterError ? "Use valid filters, or clear them to start again." : data.filters.cursor ? "Return to the first page to see your invoices." : filtered ? "Try another title or status." : "Raise an invoice from a completed job, convert an approved quotation, or start one for any customer."} className="min-h-64" />
            {!filtered && !data.filters.cursor && !data.filterError && <div className="mt-4 flex justify-center"><Link href="/invoices/new" className={buttonVariants()}><Plus aria-hidden="true" />Create your first invoice</Link></div>}
          </div>
        )}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-muted-foreground">{data.invoices.length} {data.invoices.length === 1 ? "invoice" : "invoices"} on this page{data.nextCursor ? " · More available" : ""}</p>
          <nav aria-label="Invoice pages" className="flex flex-wrap gap-2">
            {data.filters.cursor && <Link href={pageHref(data)} className={buttonVariants({ variant: "outline" })}>First page</Link>}
            {data.nextCursor && <Link href={pageHref(data, data.nextCursor)} className={buttonVariants({ variant: "outline" })}>Next page<ArrowRight aria-hidden="true" /></Link>}
          </nav>
        </div>
      </section>
    </Card>
  </>;
}
