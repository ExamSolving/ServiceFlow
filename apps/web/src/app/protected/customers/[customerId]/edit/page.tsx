import type { Metadata } from "next";
import { CustomerForm } from "@/src/features/customers/components/customer-form";
import { getCustomer } from "@/src/features/customers/services/customer.service";

export const metadata: Metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const customer = await getCustomer(customerId);
  return <CustomerForm key={`${customer.id}:${customer.version}`} customer={customer} />;
}
