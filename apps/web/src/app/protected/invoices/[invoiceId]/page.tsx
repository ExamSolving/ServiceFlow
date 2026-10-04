import type { Metadata } from "next";

import { InvoiceDetailView } from "@/src/features/invoices/components/invoice-detail-view";
import { getInvoiceContext } from "@/src/features/invoices/services/invoice.service";

export const metadata: Metadata = { title: "Invoice details" };

export default async function InvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const context = await getInvoiceContext((await params).invoiceId);
  return <InvoiceDetailView context={context} />;
}
