import { ArrowRight, Wallet } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { formatBillingDateTime, paymentMethodLabel, paymentMethodOptions } from "@/src/features/billing/components/billing-format";
import { formatMoney } from "@/src/lib/billing/money";
import type { PaymentListData } from "../types/payment";

const selectStyle = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function pageHref(data: PaymentListData, cursor?: string) {
  const query = new URLSearchParams();
  if (data.filters.method !== "ALL") query.set("method", data.filters.method);
  if (data.filters.invoiceId) query.set("invoiceId", data.filters.invoiceId);
  if (cursor) query.set("cursor", cursor);
  return `/payments${query.size ? `?${query.toString()}` : ""}`;
}

export function PaymentsView({ data }: { data: PaymentListData }) {
  const filtered = Boolean(data.filters.method !== "ALL" || data.filters.invoiceId);
  const pageTotal = data.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const currency = data.payments[0]?.currency;
  return <>
    <PageHeader title="Payments" description="Every payment recorded against your invoices, newest first. Record new payments from an invoice."
      breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Payments" }]}
      actions={<Link href="/invoices?status=ISSUED" className={buttonVariants({ variant: "outline" })}><Wallet aria-hidden="true" />Open invoices</Link>} />
    <Card className="gap-0 py-0">
      <section aria-labelledby="payments-heading">
        <div className="border-b border-border p-4 sm:p-5">
          <SectionHeading id="payments-heading" title="Payment ledger" description={data.filters.invoiceId ? "Showing payments for one invoice." : "Payments are immutable; void and re-issue an invoice to correct a mistake before any payment is recorded."} />
          <Form action="/payments" className="mt-5 grid items-end gap-3 sm:grid-cols-[12rem_auto]">
            {data.filters.invoiceId && <input type="hidden" name="invoiceId" value={data.filters.invoiceId} />}
            <div className="space-y-2">
              <Label htmlFor="payment-method-filter">Method</Label>
              <select key={data.filters.method} id="payment-method-filter" name="method" defaultValue={data.filters.method} className={selectStyle}>
                <option value="ALL">All methods</option>
                {paymentMethodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="outline">Apply</Button>
              {(filtered || data.filters.cursor || data.filterError) && <Link href="/payments" className={buttonVariants({ variant: "ghost" })}>Clear</Link>}
            </div>
          </Form>
        </div>
        {data.filterError && <div className="p-4 pb-0 sm:px-5"><Alert variant="destructive"><AlertTitle>Check your filters</AlertTitle><AlertDescription>{data.filterError}</AlertDescription></Alert></div>}
        {data.payments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Payments, newest first</caption>
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr><th scope="col" className="px-5 py-3 font-medium">Received</th><th scope="col" className="px-4 py-3 font-medium">Invoice</th><th scope="col" className="px-4 py-3 font-medium">Customer</th><th scope="col" className="px-4 py-3 font-medium">Method</th><th scope="col" className="px-4 py-3 font-medium">Reference</th><th scope="col" className="px-5 py-3 text-right font-medium">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.payments.map((payment) => (
                  <tr key={payment.id} className="transition-colors hover:bg-muted/25">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-muted-foreground"><time dateTime={payment.paidAt}>{formatBillingDateTime(payment.paidAt, data.timezone)}</time></td>
                    <td className="px-4 py-3"><Link href={`/invoices/${encodeURIComponent(payment.invoiceId)}`} className="rounded font-mono text-xs font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{payment.invoiceNumber}</Link></td>
                    <td className="max-w-56 px-4 py-3 break-words">{payment.customerName}</td>
                    <td className="px-4 py-3"><Badge variant="positive">{paymentMethodLabel(payment.method)}</Badge></td>
                    <td className="max-w-64 px-4 py-3 text-xs text-muted-foreground"><span className="line-clamp-2 break-words">{[payment.reference, payment.notes].filter(Boolean).join(" · ") || "—"}</span><span className="mt-0.5 block">{payment.recordedByName || "Team member"}</span></td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-medium tabular-nums">{formatMoney(payment.amount, payment.currency)}</td>
                  </tr>
                ))}
              </tbody>
              {currency && <tfoot className="border-t border-border"><tr><th scope="row" colSpan={5} className="px-5 py-3 text-right text-xs font-normal text-muted-foreground">Total on this page</th><td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums">{formatMoney(pageTotal, currency)}</td></tr></tfoot>}
            </table>
          </div>
        ) : (
          <div className="p-4 sm:p-5"><EmptyState icon={Wallet} title={data.filterError ? "Adjust your filters" : data.filters.cursor ? "You’ve reached the end" : filtered ? "No matching payments" : "No payments recorded yet"} description={data.filterError ? "Use valid filters, or clear them to start again." : data.filters.cursor ? "Return to the first page to see recent payments." : filtered ? "Try another method or clear the invoice filter." : "Open an issued invoice and record the money you receive against it."} className="min-h-56" /></div>
        )}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-muted-foreground">{data.payments.length} {data.payments.length === 1 ? "payment" : "payments"} on this page{data.nextCursor ? " · More available" : ""}</p>
          <nav aria-label="Payment pages" className="flex flex-wrap gap-2">
            {data.filters.cursor && <Link href={pageHref(data)} className={buttonVariants({ variant: "outline" })}>First page</Link>}
            {data.nextCursor && <Link href={pageHref(data, data.nextCursor)} className={buttonVariants({ variant: "outline" })}>Next page<ArrowRight aria-hidden="true" /></Link>}
          </nav>
        </div>
      </section>
    </Card>
  </>;
}
