import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ServiceRequestForm } from "@/src/features/service-requests/components/service-request-form";
import { getServiceRequest } from "@/src/features/service-requests/services/service-request.service";
import { canEditServiceRequest } from "@/src/features/service-requests/utils/request-workflow";

export const metadata: Metadata = { title: "Edit service request" };

export default async function EditServiceRequestPage({ params }: {
  params: Promise<{ serviceRequestId: string }>;
}) {
  const { serviceRequestId } = await params;
  const serviceRequest = await getServiceRequest(serviceRequestId);
  // Cancelled, scheduled or converted requests are read-only; send the user to the record instead.
  if (!canEditServiceRequest(serviceRequest.status)) redirect(`/service-requests/${encodeURIComponent(serviceRequest.id)}`);
  return <ServiceRequestForm key={`${serviceRequest.id}:${serviceRequest.version}`} serviceRequest={serviceRequest} />;
}
