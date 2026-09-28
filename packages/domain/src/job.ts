export type JobStatus =
  | "NEW"
  | "ASSIGNED"
  | "ACCEPTED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "DIAGNOSING"
  | "QUOTATION_REQUIRED"
  | "WAITING_APPROVAL"
  | "APPROVED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "COMPLETED"
  | "INVOICED"
  | "PARTIAL"
  | "PAID"
  | "CLOSED"
  | "REJECTED"
  | "CANCELLED"
  | "RESCHEDULED";

export type JobPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface Job {
  id: string;
  organizationId: string;

  jobNumber: string;

  customerId: string;
  serviceRequestId?: string | null;
  serviceTypeId: string;

  assignedTechnicianId?: string | null;

  title: string;
  description?: string;

  priority: JobPriority;
  status: JobStatus;

  scheduledAt?: Date | null;

  createdBy: string;

  createdAt: Date;
  updatedAt: Date;
}
