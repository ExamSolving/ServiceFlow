import type { JobStatus } from "./job";

const transitions: Record<JobStatus, readonly JobStatus[]> = {
  NEW: ["ASSIGNED", "CANCELLED"],

  ASSIGNED: ["ACCEPTED", "REJECTED", "RESCHEDULED", "CANCELLED"],

  ACCEPTED: ["EN_ROUTE", "RESCHEDULED", "CANCELLED"],

  EN_ROUTE: ["ARRIVED", "CANCELLED"],

  ARRIVED: ["DIAGNOSING", "IN_PROGRESS", "CANCELLED"],

  DIAGNOSING: ["QUOTATION_REQUIRED", "IN_PROGRESS", "ON_HOLD", "CANCELLED"],

  QUOTATION_REQUIRED: ["WAITING_APPROVAL", "CANCELLED"],

  WAITING_APPROVAL: ["APPROVED", "CANCELLED"],

  APPROVED: ["IN_PROGRESS", "CANCELLED"],

  IN_PROGRESS: ["ON_HOLD", "COMPLETED"],

  ON_HOLD: ["IN_PROGRESS", "CANCELLED"],

  COMPLETED: ["INVOICED"],

  INVOICED: ["PARTIAL", "PAID"],

  PARTIAL: ["PAID"],

  PAID: ["CLOSED"],

  CLOSED: [],

  REJECTED: [],

  CANCELLED: [],

  RESCHEDULED: ["ASSIGNED", "CANCELLED"],
};

export function canTransitionJob(current: JobStatus, next: JobStatus): boolean {
  return transitions[current].includes(next);
}

export function getAllowedJobTransitions(
  current: JobStatus,
): readonly JobStatus[] {
  return transitions[current];
}
