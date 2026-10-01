import type { Metadata } from "next";
import { ServiceRequestsView } from "@/src/features/service-requests/components/service-requests-view";
import { getServiceRequestsPage } from "@/src/features/service-requests/services/service-request.service";

export const metadata: Metadata = { title: "Service requests" };

export default async function ServiceRequestsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ServiceRequestsView data={await getServiceRequestsPage(await searchParams)} />;
}
