/**
 * Jobs as the technician API sends them. Mirrors
 * apps/web/src/features/mobile/types/mobile-jobs.ts.
 */

export const JOB_STATUSES = [
  'NEW',
  'ASSIGNED',
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'DIAGNOSING',
  'QUOTATION_REQUIRED',
  'WAITING_APPROVAL',
  'APPROVED',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'INVOICED',
  'PARTIAL',
  'PAID',
  'CLOSED',
  'REJECTED',
  'CANCELLED',
  'RESCHEDULED',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type JobPriority = (typeof JOB_PRIORITIES)[number];

/** What a move asks for: a required reason, an optional note, or a confirmation with an optional note. */
export const MOVE_INPUTS = ['none', 'reason', 'note', 'confirm'] as const;
export type MoveInput = (typeof MOVE_INPUTS)[number];

export interface JobSummary {
  id: string;
  jobNumber: string;
  title: string;
  status: JobStatus;
  priority: JobPriority;
  /** Visit time as an ISO instant, shown in the workspace's time zone. */
  scheduledAt: string | null;
  estimatedDurationMinutes: number | null;
  customerName: string;
  serviceAddress: string;
  serviceTypeName: string;
  completedAt: string | null;
  updatedAt: string;
  version: number;
}

/** A status move the technician can make; the first one is the job's main next step. */
export interface JobMove {
  to: JobStatus;
  input: MoveInput;
}

export interface JobNote {
  id: string;
  body: string;
  authorName: string;
  mine: boolean;
  createdAt: string;
}

/** A status change on the job, newest first. */
export interface JobEvent {
  id: string;
  at: string;
  from: JobStatus | null;
  to: JobStatus;
  note: string | null;
  /** The technician's name when the change was made in the app; null for the office and billing. */
  technicianName: string | null;
  declined: boolean;
}

export interface JobDetail extends JobSummary {
  description: string;
  customerNumber: string;
  /** Only while the job is open. */
  customerPhone: string | null;
  notes: JobNote[];
  history: JobEvent[];
  moves: JobMove[];
  canAddNote: boolean;
}

export interface JobList {
  open: JobSummary[];
  /** Completed in the last 7 days, newest first. */
  done: JobSummary[];
  /** More open jobs exist than were sent. */
  truncated: boolean;
  generatedAt: string;
}

/** A status move to send. The same requestId on a retry makes sure it is applied once. */
export interface MoveRequest {
  to: JobStatus;
  version: number;
  requestId: string;
  reason?: string;
  note?: string;
}
