import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DocumentForm } from "@/src/features/billing/components/document-form";
import { getQuotationContext } from "@/src/features/quotations/services/quotation.service";

export const metadata: Metadata = { title: "Edit quotation" };

export default async function EditQuotationPage({ params }: { params: Promise<{ quotationId: string }> }) {
  const { quotation, defaultTaxRatePercent, quoteValidityDays } = await getQuotationContext((await params).quotationId);
  if (quotation.status !== "DRAFT") redirect(`/quotations/${encodeURIComponent(quotation.id)}`);
  return <DocumentForm key={`${quotation.id}:${quotation.version}`} kind="quotation" currency={quotation.currency} defaultTaxRatePercent={defaultTaxRatePercent} defaultDays={quoteValidityDays}
    document={{ id: quotation.id, version: quotation.version, customerId: quotation.customerId, customerName: quotation.customerName, customerNumber: quotation.customerNumber, jobId: quotation.jobId, jobNumber: quotation.jobNumber, title: quotation.title, notes: quotation.notes, date: quotation.validUntil, lineItems: quotation.lineItems }} />;
}
