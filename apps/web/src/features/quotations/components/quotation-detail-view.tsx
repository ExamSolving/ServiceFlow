import { ArrowUpRight, FileText, Pencil, Receipt } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { formatBillingDate, formatBillingDateTime, formatCalendarDate } from "@/src/features/billing/components/billing-format";
import { QuotationStatusBadge } from "@/src/features/billing/components/document-status";
import { LineItemsTable } from "@/src/features/billing/components/line-items-table";
import type { QuotationContext } from "../types/quotation";
import { QuotationActions } from "./quotation-actions";

export function QuotationDetailView({ context }: { context: QuotationContext }) {
  const { quotation, timezone, today, canConvert } = context;
  const expired = quotation.validUntil < today;
  return <>
    <PageHeader title={quotation.title} description={quotation.quotationNumber}
      breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Quotations", href: "/quotations" }, { label: quotation.quotationNumber }]}
      actions={<>
        {quotation.invoiceId && <Link href={`/invoices/${encodeURIComponent(quotation.invoiceId)}`} className={buttonVariants({ variant: "outline" })}><Receipt aria-hidden="true" />View invoice</Link>}
        {quotation.status === "DRAFT" && <Link href={`/quotations/${encodeURIComponent(quotation.id)}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil aria-hidden="true" />Edit quotation</Link>}
      </>} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Quotation details" action={<QuotationStatusBadge status={quotation.status} expired={expired} />} /></CardHeader>
          <CardContent>
            <dl className="grid gap-6 sm:grid-cols-2">
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">Customer</dt><dd className="mt-2 break-words text-sm"><Link href={`/customers/${encodeURIComponent(quotation.customerId)}`} className="inline-flex items-center gap-1 rounded font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{quotation.customerName}<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link><span className="mt-1 block text-xs text-muted-foreground">{quotation.customerNumber}</span></dd></div>
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">Linked job</dt><dd className="mt-2 text-sm">{quotation.jobId ? <Link href={`/jobs/${encodeURIComponent(quotation.jobId)}`} className="inline-flex items-center gap-1 rounded font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{quotation.jobNumber}<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link> : <span className="text-muted-foreground">Not linked to a job</span>}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Valid until</dt><dd className="mt-2 text-sm">{formatCalendarDate(quotation.validUntil)}{expired && quotation.status === "SENT" && <span className="ml-2 text-xs text-destructive">Past validity</span>}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Currency</dt><dd className="mt-2 text-sm">{quotation.currency}</dd></div>
              <div className="min-w-0 border-t border-border pt-5 sm:col-span-2"><dt className="text-xs text-muted-foreground">Notes</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{quotation.notes || <span className="text-muted-foreground">No notes.</span>}</dd></div>
            </dl>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <div className="border-b border-border p-4 sm:p-5"><SectionHeading title="Line items" description={quotation.status === "DRAFT" ? "Edit the quotation to change its lines." : "Lines are locked once a quotation is sent."} action={<FileText aria-hidden="true" className="size-4 text-muted-foreground" />} /></div>
          <LineItemsTable items={quotation.lineItems} currency={quotation.currency} subtotal={quotation.subtotal} taxTotal={quotation.taxTotal} total={quotation.total} linkProducts />
        </Card>
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Status & actions" /></CardHeader>
          <CardContent className="space-y-5">
            <QuotationActions key={`${quotation.id}:${quotation.version}`} quotation={quotation} canConvert={canConvert} expired={expired} />
            <dl className="space-y-4 border-t border-border pt-4 text-sm">
              <div><dt className="text-xs text-muted-foreground">Created</dt><dd className="mt-1"><time dateTime={quotation.createdAt}>{formatBillingDate(quotation.createdAt)}</time></dd></div>
              {quotation.sentAt && <div><dt className="text-xs text-muted-foreground">Sent</dt><dd className="mt-1"><time dateTime={quotation.sentAt}>{formatBillingDateTime(quotation.sentAt, timezone)}</time></dd></div>}
              {quotation.decidedAt && <div><dt className="text-xs text-muted-foreground">Decided</dt><dd className="mt-1"><time dateTime={quotation.decidedAt}>{formatBillingDateTime(quotation.decidedAt, timezone)}</time></dd></div>}
              {quotation.invoiceId && <div><dt className="text-xs text-muted-foreground">Invoice</dt><dd className="mt-1"><Link href={`/invoices/${encodeURIComponent(quotation.invoiceId)}`} className="font-medium text-primary underline">{quotation.invoiceNumber}</Link></dd></div>}
              <div><dt className="text-xs text-muted-foreground">Last updated</dt><dd className="mt-1"><time dateTime={quotation.updatedAt}>{formatBillingDate(quotation.updatedAt)}</time></dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">Times shown in {timezone}; record dates in UTC.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  </>;
}
