import type { Metadata } from "next";

import { StockView } from "@/src/features/products/components/stock-view";
import { getStockLedger } from "@/src/features/products/services/product.service";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await getStockLedger(await searchParams);
  return <StockView data={data} />;
}
