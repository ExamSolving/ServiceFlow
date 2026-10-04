import type { Metadata } from "next";

import { QuotationsView } from "@/src/features/quotations/components/quotations-view";
import { getQuotationsPage } from "@/src/features/quotations/services/quotation.service";

export const metadata: Metadata = { title: "Quotations" };

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await getQuotationsPage(await searchParams);
  return <QuotationsView data={data} />;
}
