import type { Metadata } from "next";
import { ServiceTypesView } from "@/src/features/service-types/components/service-types-view";
import { getServiceTypesPage } from "@/src/features/service-types/services/service-type.service";

export const metadata: Metadata = { title: "Service types" };

export default async function ServiceTypesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ServiceTypesView data={await getServiceTypesPage(await searchParams)} />;
}
