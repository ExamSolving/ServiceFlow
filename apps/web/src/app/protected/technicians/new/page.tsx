import type { Metadata } from "next";
import { TechnicianForm } from "@/src/features/technicians/components/technician-form";
import { getTechnicianFormContext } from "@/src/features/technicians/services/technician.service";

export const metadata: Metadata = { title: "Add technician" };

export default async function NewTechnicianPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getTechnicianFormContext(await searchParams);
  return <TechnicianForm key={context.memberCursor ?? "first"} context={context} />;
}
