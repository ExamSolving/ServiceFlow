import type { Metadata } from "next";
import { ServiceRequestDetailView } from "@/src/features/service-requests/components/service-request-detail-view";
import { getServiceRequest } from "@/src/features/service-requests/services/service-request.service";

export const metadata: Metadata = { title: "Service request details" };

export default async function ServiceRequestPage({ params }: {
  params: Promise<{ serviceRequestId: string }>;
}) {
  const { serviceRequestId } = await params;
  return <ServiceRequestDetailView serviceRequest={await getServiceRequest(serviceRequestId)} />;
}
