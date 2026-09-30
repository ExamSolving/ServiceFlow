import type { Metadata } from "next";
import { TechniciansView } from "@/src/features/technicians/components/technicians-view";
import { getTechniciansPage } from "@/src/features/technicians/services/technician.service";

export const metadata: Metadata = { title: "Technicians" };

export default async function TechniciansPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TechniciansView data={await getTechniciansPage(await searchParams)} />;
}
