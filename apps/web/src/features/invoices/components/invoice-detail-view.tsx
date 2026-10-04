import { ArrowUpRight, FileText, Pencil, Wallet } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { formatBillingDate, formatBillingDateTime, formatCalendarDate, paymentMethodLabel } from "@/src/features/billing/components/billing-format";
import { InvoiceStatusBadge } from "@/src/features/billing/components/document-status";
import { LineItemsTable } from "@/src/features/billing/components/line-items-table";
import { PaymentForm } from "@/src/features/payments/components/payment-form";
import { formatMoney } from "@/src/lib/billing/money";
import type { InvoiceContext } from "../types/invoice";
import { InvoiceActions } from "./invoice-actions";
import { isOverdue } from "./invoices-view";

export function InvoiceDetailView({ context }: { context: InvoiceContext }) {
  const { invoice, payments, timezone, today, canRecordPayments } = context;
  const overdue = isOverdue(invoice, today);
  const open = invoice.status === "ISSUED" || invoice.status === "PARTIALLY_PAID";
  return <>
    <PageHeader title={invoice.title} description={invoice.invoiceNumber}
      breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Invoices", href: "/invoices" }, { label: invoice.invoiceNumber }]}
      actions={<>
        {invoice.quotationId && <Link href={`/quotations/${encodeURIComponent(invoice.quotationId)}`} className={buttonVariants({ variant: "outline" })}><FileText aria-hidden="true" />View quotation</Link>}
        {invoice.status === "DRAFT" && <Link href={`/invoices/${encodeURIComponent(invoice.id)}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil aria-hidden="true" />Edit invoice</Link>}
      </>} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Invoice details" action={<InvoiceStatusBadge status={invoice.status} overdue={overdue} />} /></CardHeader>
          <CardContent>
            <dl className="grid gap-6 sm:grid-cols-2">
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">Customer</dt><dd className="mt-2 break-words text-sm"><Link href={`/customers/${encodeURIComponent(invoice.customerId)}`} className="inline-flex items-center gap-1 rounded font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{invoice.customerName}<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link><span className="mt-1 block text-xs text-muted-foreground">{invoice.customerNumber}</span></dd></div>
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">Linked job</dt><dd className="mt-2 text-sm">{invoice.jobId ? <Link href={`/jobs/${encodeURIComponent(invoice.jobId)}`} className="inline-flex items-center gap-1 rounded font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{invoice.jobNumber}<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link> : <span className="text-muted-foreground">Not linked to a job</span>}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Due date</dt><dd className="mt-2 text-sm">{invoice.dueAt ? formatCalendarDate(invoice.dueAt) : <span className="text-muted-foreground">Set when issued</span>}{overdue && <span className="ml-2 text-xs text-destructive">Overdue</span>}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Source quotation</dt><dd className="mt-2 text-sm">{invoice.quotationId ? <Link href={`/quotations/${encodeURIComponent(invoice.quotationId)}`} className="font-medium text-primary underline">{invoice.quotationNumber}</Link> : <span className="text-muted-foreground">Created directly</span>}</dd></div>
              <div className="min-w-0 border-t border-border pt-5 sm:col-span-2"><dt className="text-xs text-muted-foreground">Notes</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{invoice.notes || <span className="text-muted-foreground">No notes.</span>}</dd></div>
            </dl>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <div className="border-b border-border p-4 sm:p-5"><SectionHeading title="Line items" description={invoice.status === "DRAFT" ? "Edit the invoice to change its lines." : "Lines are locked once an invoice is issued."} action={<FileText aria-hidden="true" className="size-4 text-muted-foreground" />} /></div>
          <LineItemsTable items={invoice.lineItems} currency={invoice.currency} subtotal={invoice.subtotal} taxTotal={invoice.taxTotal} total={invoice.total} linkProducts
            footer={invoice.status !== "DRAFT" && invoice.status !== "VOID" ? <>
              <tr><th scope="row" colSpan={4} className="px-5 py-2 text-right font-normal text-muted-foreground">Paid</th><td className="whitespace-nowrap px-5 py-2 text-right tabular-nums">{formatMoney(invoice.amountPaid, invoice.currency)}</td></tr>
              <tr><th scope="row" colSpan={4} className="px-5 py-3 text-right font-semibold">Balance due</th><td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums">{formatMoney(invoice.balanceDue, invoice.currency)}</td></tr>
            </> : undefined} />
        </Card>
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Payments" description={open ? "Record money received against this invoice." : "Payments recorded against this invoice."} action={<Wallet aria-hidden="true" className="size-4 text-muted-foreground" />} /></CardHeader>
          <CardContent className="space-y-5">
            {open && canRecordPayments && <PaymentForm key={`${invoice.id}:${invoice.version}`} invoice={invoice} timezone={timezone} />}
            {open && !canRecordPayments && <p className="text-xs leading-5 text-muted-foreground">Only users who record payments can add one here.</p>}
            {payments.length ? (
              <ul className="divide-y divide-border">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0 text-sm">
                    <div className="min-w-0"><p className="flex flex-wrap items-center gap-2"><Badge variant="positive">{paymentMethodLabel(payment.method)}</Badge><span className="text-xs text-muted-foreground"><time dateTime={payment.paidAt}>{formatBillingDateTime(payment.paidAt, timezone)}</time></span></p><p className="mt-1.5 text-xs text-muted-foreground break-words">{[payment.reference, payment.notes].filter(Boolean).join(" · ") || "No reference"} · {payment.recordedByName || "Team member"}</p></div>
                    <p className="font-medium tabular-nums">{formatMoney(payment.amount, payment.currency)}</p>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={Wallet} title="No payments yet" description={open ? "Payments you record will appear here." : "This invoice has no payments recorded."} className="min-h-24" />}
          </CardContent>
        </Card>
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Status & actions" /></CardHeader>
          <CardContent className="space-y-5">
            <InvoiceActions key={`${invoice.id}:${invoice.version}`} invoice={invoice} hasTrackedLines={invoice.lineItems.some((item) => item.productId)} />
            <dl className="space-y-4 border-t border-border pt-4 text-sm">
              <div className="flex items-center justify-between gap-3"><dt className="text-xs text-muted-foreground">Total</dt><dd className="font-medium tabular-nums">{formatMoney(invoice.total, invoice.currency)}</dd></div>
              {invoice.status !== "DRAFT" && invoice.status !== "VOID" && <div className="flex items-center justify-between gap-3"><dt className="text-xs text-muted-foreground">Balance due</dt><dd className="font-heading text-lg font-semibold tabular-nums">{formatMoney(invoice.balanceDue, invoice.currency)}</dd></div>}
              <div><dt className="text-xs text-muted-foreground">Created</dt><dd className="mt-1"><time dateTime={invoice.createdAt}>{formatBillingDate(invoice.createdAt)}</time></dd></div>
              {invoice.issuedAt && <div><dt className="text-xs text-muted-foreground">Issued</dt><dd className="mt-1"><time dateTime={invoice.issuedAt}>{formatBillingDateTime(invoice.issuedAt, timezone)}</time></dd></div>}
              {invoice.paidAt && <div><dt className="text-xs text-muted-foreground">Paid in full</dt><dd className="mt-1"><time dateTime={invoice.paidAt}>{formatBillingDateTime(invoice.paidAt, timezone)}</time></dd></div>}
              {invoice.voidedAt && <div><dt className="text-xs text-muted-foreground">Voided</dt><dd className="mt-1"><time dateTime={invoice.voidedAt}>{formatBillingDateTime(invoice.voidedAt, timezone)}</time></dd></div>}
              <div><dt className="text-xs text-muted-foreground">Last updated</dt><dd className="mt-1"><time dateTime={invoice.updatedAt}>{formatBillingDate(invoice.updatedAt)}</time></dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">Times shown in {timezone}; record dates in UTC.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  </>;
}
