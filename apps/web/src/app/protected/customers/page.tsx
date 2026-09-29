import type { Metadata } from "next";
import { CustomersView } from "@/src/features/customers/components/customers-view";
import { getCustomersPage } from "@/src/features/customers/services/customer.service";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await getCustomersPage(await searchParams);
  return <CustomersView data={data} />;
}
