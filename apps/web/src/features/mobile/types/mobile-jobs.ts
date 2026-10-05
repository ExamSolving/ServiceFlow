import type { TechnicianMoveInput } from "@/../../packages/domain/src/job-technician-moves";
import type { JobPriority, JobStatus } from "@/src/features/jobs/types/job";

export type { TechnicianMoveInput };

/** A job in the technician app's list. Mirrored in apps/mobile/src/lib/jobs/types.ts. */
export interface MobileJobSummary {
  id: string;
  jobNumber: string;
  title: string;
  status: JobStatus;
  priority: JobPriority;
  /** Visit time as an ISO instant; the app shows it in the workspace time zone. */
  scheduledAt: string | null;
  estimatedDurationMinutes: number | null;
  customerName: string;
  serviceAddress: string;
  serviceTypeName: string;
  completedAt: string | null;
  updatedAt: string;
  version: number;
}

/** A status move the technician can make; the first one offered is the job's main next step. */
export interface MobileJobMove {
  to: JobStatus;
  input: TechnicianMoveInput;
}

export interface MobileJobNote {
  id: string;
  body: string;
  authorName: string;
  /** Written by the signed-in technician. */
  mine: boolean;
  createdAt: string;
}

/** A status change on the job, newest first. */
export interface MobileJobEvent {
  id: string;
  at: string;
  from: JobStatus | null;
  to: JobStatus;
  /** The reason or note given with the change. */
  note: string | null;
  /** The technician's name when the change was made in the app; null for office and billing changes. */
  technicianName: string | null;
  declined: boolean;
}

export interface MobileJobDetail extends MobileJobSummary {
  description: string;
  customerNumber: string;
  /** Only while the job is open: hidden once it is Completed, Cancelled or Rejected. */
  customerPhone: string | null;
  notes: MobileJobNote[];
  history: MobileJobEvent[];
  moves: MobileJobMove[];
  canAddNote: boolean;
}

export interface MobileJobList {
  /** Assigned through On hold, plus Rescheduled jobs the office is changing; by visit time, unscheduled last. */
  open: MobileJobSummary[];
  /** Completed in the last 7 days, newest first. */
  done: MobileJobSummary[];
  /** More open jobs exist than were sent. */
  truncated: boolean;
  generatedAt: string;
}
