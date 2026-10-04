import { ArrowRight, Receipt } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatMoney } from "@/src/lib/billing/money";
import type { DashboardFinance } from "../types/dashboard";

export function DashboardFinanceCard({ finance }: { finance: DashboardFinance }) {
  const rows = [
    { label: "Quotations awaiting a decision", value: String(finance.pendingQuotations), href: "/quotations?status=SENT" },
    { label: "Open invoices", value: `${finance.openInvoices} · ${formatMoney(finance.outstandingAmount, finance.currency)}`, href: "/invoices?status=ISSUED" },
    { label: "Overdue invoices", value: String(finance.overdueInvoices), href: "/invoices?status=ISSUED", alert: finance.overdueInvoices > 0 },
    { label: "Collected in the last 30 days", value: formatMoney(finance.collectedLast30Days, finance.currency), href: "/payments" },
  ];
  return (
    <Card className="p-5 sm:p-6">
      <section aria-labelledby="finance-heading">
        <div className="mb-5">
          <SectionHeading id="finance-heading" title="Billing" description={`Amounts in ${finance.currency}`} action={<Receipt className="size-4 text-muted-foreground" aria-hidden="true" />} />
        </div>
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.label}>
              <Link href={row.href} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/50 px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
                <span className="text-xs text-muted-foreground">{row.label}</span>
                <span className={`inline-flex items-center gap-1.5 font-heading text-sm font-semibold tabular-nums ${row.alert ? "text-destructive" : ""}`}>{row.value}<ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground" /></span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-muted-foreground">Open invoices are issued or partially paid; overdue uses the organization’s calendar date.</p>
      </section>
    </Card>
  );
}
