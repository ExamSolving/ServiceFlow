export type ServiceRequestStatus = "NEW" | "REVIEWING" | "SCHEDULED" | "CONVERTED_TO_JOB" | "CANCELLED";
export type ServiceRequestPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface ServiceRequestFormValues {
  customerId: string;
  serviceTypeId: string;
  title: string;
  description: string;
  priority: ServiceRequestPriority;
}
export interface ServiceRequestDetail extends ServiceRequestFormValues {
  convertedJobId?: string;
  id: string;
  customerName: string;
  customerNumber: string;
  serviceTypeName: string;
  status: ServiceRequestStatus;
  version: number;
  requestedAt: string;
  createdAt: string;
  updatedAt: string;
}
export interface ServiceRequestListFilters {
  q: string;
  status: "ALL" | ServiceRequestStatus;
  priority: "ALL" | ServiceRequestPriority;
  cursor?: string;
}
export interface ServiceRequestListData {
  requests: ServiceRequestDetail[];
  filters: ServiceRequestListFilters;
  nextCursor: string | null;
  filterError?: string;
}
export interface ServiceRequestOption { id: string; name: string; secondary?: string }
export interface ServiceRequestOptions { options: ServiceRequestOption[]; nextCursor: string | null }
export type ServiceRequestSearchParams = Record<string, string | string[] | undefined>;
