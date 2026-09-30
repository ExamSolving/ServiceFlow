import type { Metadata } from "next";
import { TechnicianDetailView } from "@/src/features/technicians/components/technician-detail-view";
import { getTechnician } from "@/src/features/technicians/services/technician.service";

export const metadata: Metadata = { title: "Technician details" };

export default async function TechnicianPage({ params }: {
  params: Promise<{ technicianId: string }>;
}) {
  const { technicianId } = await params;
  return <TechnicianDetailView technician={await getTechnician(technicianId)} />;
}
