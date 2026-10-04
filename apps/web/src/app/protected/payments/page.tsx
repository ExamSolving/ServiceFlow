import type { Metadata } from "next";

import { PaymentsView } from "@/src/features/payments/components/payments-view";
import { getPaymentsPage } from "@/src/features/payments/services/payment.service";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await getPaymentsPage(await searchParams);
  return <PaymentsView data={data} />;
}
