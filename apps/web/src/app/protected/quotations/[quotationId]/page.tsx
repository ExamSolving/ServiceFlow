import type { Metadata } from "next";

import { QuotationDetailView } from "@/src/features/quotations/components/quotation-detail-view";
import { getQuotationContext } from "@/src/features/quotations/services/quotation.service";

export const metadata: Metadata = { title: "Quotation details" };

export default async function QuotationPage({ params }: { params: Promise<{ quotationId: string }> }) {
  const context = await getQuotationContext((await params).quotationId);
  return <QuotationDetailView context={context} />;
}
