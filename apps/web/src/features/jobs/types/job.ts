import type { JobPriority, JobStatus } from "@/../../packages/domain/src/job";
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
  scheduledAt: string | null;
  status: JobStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface JobListFilters { q: string; status: "ALL" | JobStatus; priority: "ALL" | JobPriority; cursor?: string }
export interface JobListData { jobs: JobDetail[]; filters: JobListFilters; nextCursor: string | null; filterError?: string }
export type JobSearchParams = Record<string, string | string[] | undefined>;
