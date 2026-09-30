import type { Metadata } from "next";
import { ServiceTypeForm } from "@/src/features/service-types/components/service-type-form";
import { getServiceType } from "@/src/features/service-types/services/service-type.service";

export const metadata: Metadata = { title: "Edit service type" };

export default async function EditServiceTypePage({ params }: {
  params: Promise<{ serviceTypeId: string }>;
}) {
  const { serviceTypeId } = await params;
  const serviceType = await getServiceType(serviceTypeId);
  return <ServiceTypeForm key={`${serviceType.id}:${serviceType.version}`} serviceType={serviceType} />;
}
