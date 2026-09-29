import type { Metadata } from "next";
import { CustomerForm } from "@/src/features/customers/components/customer-form";
import { getCustomerFormContext } from "@/src/features/customers/services/customer.service";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await getCustomerFormContext();
  return <CustomerForm />;
}
