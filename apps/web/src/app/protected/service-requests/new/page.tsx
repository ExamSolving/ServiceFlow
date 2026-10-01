import type { Metadata } from "next";
import { ServiceRequestForm } from "@/src/features/service-requests/components/service-request-form";
import { getServiceRequestFormContext } from "@/src/features/service-requests/services/service-request.service";

export const metadata: Metadata = { title: "New service request" };

export default async function NewServiceRequestPage() {
  await getServiceRequestFormContext();
  return <ServiceRequestForm />;
}
