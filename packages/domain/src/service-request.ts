export type ServiceRequestStatus =
  | "NEW"
  | "REVIEWING"
  | "SCHEDULED"
  | "CONVERTED_TO_JOB"
  | "CANCELLED";

export type ServiceRequestPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface ServiceRequest {
  id: string;
  organizationId: string;

  customerId: string;
  serviceTypeId: string;

  title: string;
  description: string;

  priority: ServiceRequestPriority;
  status: ServiceRequestStatus;

  requestedAt: Date;

  createdBy: string;

  createdAt: Date;
  updatedAt: Date;
}
