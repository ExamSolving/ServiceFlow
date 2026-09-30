import type { Metadata } from "next";
import { TechnicianForm } from "@/src/features/technicians/components/technician-form";
import { getTechnician } from "@/src/features/technicians/services/technician.service";

export const metadata: Metadata = { title: "Edit technician" };

export default async function EditTechnicianPage({ params }: {
  params: Promise<{ technicianId: string }>;
}) {
  const { technicianId } = await params;
  const technician = await getTechnician(technicianId);
  return <TechnicianForm key={`${technician.id}:${technician.version}`} technician={technician} />;
}
