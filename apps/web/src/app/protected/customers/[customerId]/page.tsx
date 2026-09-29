import type { Metadata } from "next";
import { CustomerDetailView } from "@/src/features/customers/components/customer-detail-view";
import { getCustomer } from "@/src/features/customers/services/customer.service";

export const metadata: Metadata = { title: "Customer details" };

export default async function CustomerPage({ params }: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <CustomerDetailView customer={await getCustomer(customerId)} />;
}
