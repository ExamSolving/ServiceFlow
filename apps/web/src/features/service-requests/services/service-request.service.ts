import "server-only";

import { notFound } from "next/navigation";
import { requirePermission } from "@/src/lib/auth/authorization";
import { ServiceRequestCursorError, ServiceRequestNotFoundError } from "../repositories/service-request-errors";
import { listServiceRequests, readServiceRequest } from "../repositories/service-request.repository";
import { serviceRequestListFiltersSchema } from "../schemas/service-request.schema";
import type { ServiceRequestDetail, ServiceRequestListData, ServiceRequestSearchParams } from "../types/service-request";

const emptyFilters = { q: "", status: "ALL", priority: "ALL" } as const;

export async function getServiceRequestsPage(rawSearchParams: ServiceRequestSearchParams = {}): Promise<ServiceRequestListData> {
  const session = await requirePermission("manageServiceRequests");
  const parsed = serviceRequestListFiltersSchema.safeParse({
    q: rawSearchParams.q, status: rawSearchParams.status, priority: rawSearchParams.priority, cursor: rawSearchParams.cursor,
  });
  if (!parsed.success) {
    return { requests: [], filters: emptyFilters, nextCursor: null, filterError: "These filters are invalid. Clear them and try again." };
  }
  try {
    return await listServiceRequests(session, parsed.data);
  } catch (error) {
    if (error instanceof ServiceRequestCursorError) {
      return { requests: [], filters: parsed.data, nextCursor: null, filterError: "This page is no longer available. Return to the first page to continue." };
    }
    console.error("[SERVICE REQUESTS] List failed", error);
    throw new Error("We couldn’t load service requests. Please try again.");
  }
}

export async function getServiceRequest(serviceRequestId: string): Promise<ServiceRequestDetail> {
  const session = await requirePermission("manageServiceRequests");
  try {
    return await readServiceRequest(session, serviceRequestId);
  } catch (error) {
    if (error instanceof ServiceRequestNotFoundError) notFound();
    console.error("[SERVICE REQUESTS] Detail failed", error);
    throw new Error("We couldn’t load this service request. Please try again.");
  }
}

export async function getServiceRequestFormContext(): Promise<void> {
  await requirePermission("manageServiceRequests");
}
