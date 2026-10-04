import type { JobStatus } from "../types/job";
import { canTransitionJob, getAllowedJobTransitions } from "@/../../packages/domain/src/job-state-machine";
import { billingJobStatuses } from "../schemas/job.schema";

export { canTransitionJob, getAllowedJobTransitions };

/** Core fields are editable only before dispatch. */
export function canEditJob(status: JobStatus) { return status === "NEW"; }
export function canCancelJob(status: JobStatus) { return canTransitionJob(status, "CANCELLED"); }
/** Assignment and scheduling are open until field work starts. */
export function canDispatchJob(status: JobStatus) { return status === "NEW" || status === "ASSIGNED" || status === "RESCHEDULED" || status === "ACCEPTED"; }
export function isTerminalJobStatus(status: JobStatus) { return getAllowedJobTransitions(status).length === 0; }
/** Status moves available from the job page: the state machine minus billing-owned statuses. */
export function webJobTransitions(status: JobStatus): readonly JobStatus[] {
  return getAllowedJobTransitions(status).filter((next) => !(billingJobStatuses as readonly string[]).includes(next));
}
