import type { JobMove, JobPriority, JobStatus } from './types';

/** Translation keys for job wording, so every screen names statuses and buttons the same way. */

export function jobStatusKey(status: JobStatus): `jobStatus.${JobStatus}` {
  return `jobStatus.${status}`;
}

export function priorityKey(priority: JobPriority): `jobPriority.${JobPriority}` {
  return `jobPriority.${priority}`;
}

export type MoveLabelKey =
  | 'jobs.move.accept'
  | 'jobs.move.decline'
  | 'jobs.move.cantMakeIt'
  | 'jobs.move.onMyWay'
  | 'jobs.move.arrived'
  | 'jobs.move.startDiagnosis'
  | 'jobs.move.startWork'
  | 'jobs.move.resume'
  | 'jobs.move.needsQuote'
  | 'jobs.move.hold'
  | 'jobs.move.complete'
  | 'jobs.move.update';

/** The button for a move. The same status can need different words: Rescheduled is Decline or Can't make it. */
export function moveLabelKey(from: JobStatus, to: JobStatus): MoveLabelKey {
  switch (to) {
    case 'ACCEPTED':
      return 'jobs.move.accept';
    case 'RESCHEDULED':
      return from === 'ACCEPTED' ? 'jobs.move.cantMakeIt' : 'jobs.move.decline';
    case 'EN_ROUTE':
      return 'jobs.move.onMyWay';
    case 'ARRIVED':
      return 'jobs.move.arrived';
    case 'DIAGNOSING':
      return 'jobs.move.startDiagnosis';
    case 'IN_PROGRESS':
      return from === 'ON_HOLD' ? 'jobs.move.resume' : 'jobs.move.startWork';
    case 'QUOTATION_REQUIRED':
      return 'jobs.move.needsQuote';
    case 'ON_HOLD':
      return 'jobs.move.hold';
    case 'COMPLETED':
      return 'jobs.move.complete';
    default:
      return 'jobs.move.update';
  }
}

/**
 * The sheet a move opens first, which sets its wording; whether it asks for a
 * required reason or an optional note comes from the move's input. Null means
 * a one-tap move, sent after a short Undo window.
 */
export type MoveSheet = 'decline' | 'cantMakeIt' | 'hold' | 'quote' | 'complete' | 'generic';

export function moveSheet(from: JobStatus, move: JobMove): MoveSheet | null {
  if (move.to === 'RESCHEDULED') return from === 'ACCEPTED' ? 'cantMakeIt' : 'decline';
  if (move.to === 'ON_HOLD') return 'hold';
  if (move.to === 'COMPLETED') return 'complete';
  if (move.to === 'QUOTATION_REQUIRED') return 'quote';
  return move.input === 'none' ? null : 'generic';
}

export type WaitingKey =
  | 'job.waiting.QUOTATION_REQUIRED'
  | 'job.waiting.WAITING_APPROVAL'
  | 'job.waiting.RESCHEDULED'
  | 'job.waiting.done'
  | 'job.waiting.CANCELLED'
  | 'job.waiting.REJECTED';

/** Why a job has no buttons, for statuses that wait on the office or are over. */
export function waitingKey(status: JobStatus): WaitingKey | null {
  switch (status) {
    case 'QUOTATION_REQUIRED':
    case 'WAITING_APPROVAL':
    case 'RESCHEDULED':
    case 'CANCELLED':
    case 'REJECTED':
      return `job.waiting.${status}`;
    case 'COMPLETED':
    case 'INVOICED':
    case 'PARTIAL':
    case 'PAID':
    case 'CLOSED':
      return 'job.waiting.done';
    default:
      return null;
  }
}
