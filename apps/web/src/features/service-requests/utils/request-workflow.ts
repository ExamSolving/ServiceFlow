import type { ServiceRequestStatus } from "../types/service-request";

export function canEditServiceRequest(status: ServiceRequestStatus) { return status === "NEW" || status === "REVIEWING"; }
export function nextServiceRequestStatus(status: ServiceRequestStatus, action: "START_REVIEW" | "CANCEL"): ServiceRequestStatus | null {
  if (action === "START_REVIEW" && status === "NEW") return "REVIEWING";
  if (action === "CANCEL" && canEditServiceRequest(status)) return "CANCELLED";
  return null;
}
