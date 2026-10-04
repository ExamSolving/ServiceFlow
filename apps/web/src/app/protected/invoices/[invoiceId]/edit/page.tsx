import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DocumentForm } from "@/src/features/billing/components/document-form";
import { getInvoiceContext } from "@/src/features/invoices/services/invoice.service";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoice, defaultTaxRatePercent, invoiceDueDays } = await getInvoiceContext((await params).invoiceId);
  if (invoice.status !== "DRAFT") redirect(`/invoices/${encodeURIComponent(invoice.id)}`);
  return <DocumentForm key={`${invoice.id}:${invoice.version}`} kind="invoice" currency={invoice.currency} defaultTaxRatePercent={defaultTaxRatePercent} defaultDays={invoiceDueDays}
    document={{ id: invoice.id, version: invoice.version, customerId: invoice.customerId, customerName: invoice.customerName, customerNumber: invoice.customerNumber, jobId: invoice.jobId, jobNumber: invoice.jobNumber, title: invoice.title, notes: invoice.notes, date: invoice.dueAt, lineItems: invoice.lineItems }} />;
}
