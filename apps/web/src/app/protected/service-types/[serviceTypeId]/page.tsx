import type { Metadata } from "next";
import { ServiceTypeDetailView } from "@/src/features/service-types/components/service-type-detail-view";
import { getServiceType } from "@/src/features/service-types/services/service-type.service";

export const metadata: Metadata = { title: "Service type details" };

export default async function ServiceTypePage({ params }: {
  params: Promise<{ serviceTypeId: string }>;
}) {
  const { serviceTypeId } = await params;
  return <ServiceTypeDetailView serviceType={await getServiceType(serviceTypeId)} />;
}
