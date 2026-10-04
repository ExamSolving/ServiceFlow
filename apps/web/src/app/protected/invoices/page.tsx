import type { Metadata } from "next";

import { InvoicesView } from "@/src/features/invoices/components/invoices-view";
import { getInvoicesPage } from "@/src/features/invoices/services/invoice.service";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await getInvoicesPage(await searchParams);
  return <InvoicesView data={data} />;
}
