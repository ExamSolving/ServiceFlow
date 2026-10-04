import type { JobPriority, JobStatus } from "@/../../packages/domain/src/job";
import type { JobBilling } from "@/src/features/billing/types/job-billing";
export type { JobPriority, JobStatus };
export interface JobFormValues {
  customerId: string;
  serviceTypeId: string;
  title: string;
  description: string;
  priority: JobPriority;
  serviceAddress: string;
}
export interface JobDetail extends JobFormValues {
  id: string;
  jobNumber: string;
  customerName: string;
  customerNumber: string;
  serviceTypeName: string;
  serviceRequestId: string | null;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  scheduledAt: string | null;
  estimatedDurationMinutes: number | null;
  completedAt: string | null;
  status: JobStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface JobListFilters { q: string; status: "ALL" | JobStatus; priority: "ALL" | JobPriority; cursor?: string }
export interface JobListData { jobs: JobDetail[]; filters: JobListFilters; nextCursor: string | null; filterError?: string }
export type JobSearchParams = Record<string, string | string[] | undefined>;

export interface JobNote {
  id: string;
  body: string;
  authorUserId: string;
  authorName: string;
  createdAt: string;
}
export interface JobActivity {
  id: string;
  action: string;
  actorUserId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
export interface JobContext {
  job: JobDetail;
  notes: JobNote[];
  activity: JobActivity[];
  timezone: string;
  billing: JobBilling;
}
export interface TechnicianOption { id: string; name: string; secondary?: string }
export interface TechnicianOptions { options: TechnicianOption[]; nextCursor: string | null }
