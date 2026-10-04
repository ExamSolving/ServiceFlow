import type { JobStatus } from "../types/job";
import { canTransitionJob } from "@/../../packages/domain/src/job-state-machine";

export function canEditJob(status: JobStatus) { return status === "NEW"; }
// Assignment and field-work transitions require dedicated operations in later phases.
export function canCancelJob(status: JobStatus) { return status === "NEW" && canTransitionJob(status, "CANCELLED"); }
