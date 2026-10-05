import type { JobStatus } from "./job";
import { canTransitionJob } from "./job-state-machine";

/**
 * What the technician app asks for before sending a move:
 * "reason" is required, "note" is optional, "confirm" is a confirmation with an optional note.
 */
export type TechnicianMoveInput = "none" | "reason" | "note" | "confirm";

export interface TechnicianMove {
  to: JobStatus;
  input: TechnicianMoveInput;
}

/**
 * Status moves a technician may make from the phone, in the order the app
 * offers them: the first is the job's main next step. Dispatch (Assigned),
 * quotation and billing statuses, Cancelled and Rejected stay with the office.
 * A move to Rescheduled is a decline: the job goes back to the office without
 * a technician.
 */
const MOVES: Partial<Record<JobStatus, readonly TechnicianMove[]>> = {
  ASSIGNED: [
    { to: "ACCEPTED", input: "none" },
    { to: "RESCHEDULED", input: "reason" },
  ],
  ACCEPTED: [
    { to: "EN_ROUTE", input: "none" },
    { to: "RESCHEDULED", input: "reason" },
  ],
  EN_ROUTE: [{ to: "ARRIVED", input: "none" }],
  ARRIVED: [
    { to: "DIAGNOSING", input: "none" },
    { to: "IN_PROGRESS", input: "none" },
  ],
  DIAGNOSING: [
    { to: "IN_PROGRESS", input: "none" },
    { to: "QUOTATION_REQUIRED", input: "note" },
    { to: "ON_HOLD", input: "reason" },
  ],
  APPROVED: [{ to: "IN_PROGRESS", input: "none" }],
  IN_PROGRESS: [
    { to: "COMPLETED", input: "confirm" },
    { to: "ON_HOLD", input: "reason" },
  ],
  ON_HOLD: [{ to: "IN_PROGRESS", input: "none" }],
};

export function technicianMoves(current: JobStatus): readonly TechnicianMove[] {
  // The state machine has the final say, so the two lists can never disagree.
  return (MOVES[current] ?? []).filter((move) => canTransitionJob(current, move.to));
}

export function findTechnicianMove(current: JobStatus, to: JobStatus): TechnicianMove | null {
  return technicianMoves(current).find((move) => move.to === to) ?? null;
}

/** A technician's move to Rescheduled hands the job back to the office. */
export function isTechnicianDecline(move: TechnicianMove): boolean {
  return move.to === "RESCHEDULED";
}
