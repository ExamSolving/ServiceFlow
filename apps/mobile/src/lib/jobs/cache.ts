import { OFFLINE_SESSION_MAX_AGE_MS } from '@/lib/auth/session-sync';

import { parseJobDetail, parseJobList } from './parse';
import type { JobDetail, JobList, JobStatus, JobSummary } from './types';

/**
 * Rules for the jobs saved on the phone, so they open without signal. They
 * follow the saved account check (phase 14): one user only, at most 7 days
 * old, and cleared whenever the session is forgotten. Pure functions, so
 * they're unit tested.
 */

export const JOBS_CACHE_KEY = 'serviceflow.jobs.v1';
/** Allow for phones whose clock runs a little fast. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface Saved<T> {
  savedAt: number;
  value: T;
}

export interface SavedJobs {
  uid: string;
  list: Saved<JobList> | null;
  /** Jobs the technician has opened, by ID. */
  details: Record<string, Saved<JobDetail>>;
}

const OPEN: ReadonlySet<JobStatus> = new Set([
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
  'RESCHEDULED',
]);
const FINISHED: ReadonlySet<JobStatus> = new Set(['COMPLETED', 'INVOICED', 'PARTIAL', 'PAID', 'CLOSED']);

export const isOpenStatus = (status: JobStatus) => OPEN.has(status);

export function emptySavedJobs(uid: string): SavedJobs {
  return { uid, list: null, details: {} };
}

function usable(savedAt: unknown, now: number): savedAt is number {
  return typeof savedAt === 'number' && Number.isFinite(savedAt) && now - savedAt <= OFFLINE_SESSION_MAX_AGE_MS && savedAt - now <= CLOCK_SKEW_MS;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The saved jobs for this user. Anything too old, from another user or damaged is left out. */
export function readSavedJobs(raw: string | null | undefined, uid: string, now: number): SavedJobs | null {
  if (!raw || !uid) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.uid !== uid) return null;
  let list: Saved<JobList> | null = null;
  if (isRecord(value.list) && usable(value.list.savedAt, now)) {
    const parsed = parseJobList(value.list.value);
    if (parsed) list = { savedAt: value.list.savedAt, value: parsed };
  }
  const details: Record<string, Saved<JobDetail>> = {};
  if (isRecord(value.details)) {
    for (const [id, entry] of Object.entries(value.details)) {
      if (!isRecord(entry) || !usable(entry.savedAt, now)) continue;
      const job = parseJobDetail(entry.value);
      if (job && job.id === id) details[id] = { savedAt: entry.savedAt, value: job };
    }
  }
  return { uid, list, details };
}

export function serializeSavedJobs(saved: SavedJobs): string {
  return JSON.stringify({ uid: saved.uid, list: saved.list, details: saved.details });
}

/** A freshly fetched list. Saved jobs that are no longer in it are dropped. */
export function withList(saved: SavedJobs, list: JobList, now: number): SavedJobs {
  const ids = new Set([...list.open, ...list.done].map((job) => job.id));
  const details = Object.fromEntries(Object.entries(saved.details).filter(([id]) => ids.has(id)));
  return { uid: saved.uid, list: { savedAt: now, value: list }, details };
}

export function toSummary(job: JobDetail): JobSummary {
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    title: job.title,
    status: job.status,
    priority: job.priority,
    scheduledAt: job.scheduledAt,
    estimatedDurationMinutes: job.estimatedDurationMinutes,
    customerName: job.customerName,
    serviceAddress: job.serviceAddress,
    serviceTypeName: job.serviceTypeName,
    completedAt: job.completedAt,
    updatedAt: job.updatedAt,
    version: job.version,
  };
}

/** Put a job's latest state into the list: open jobs stay in place, a completed one moves to Done. */
function placed(list: JobList, job: JobDetail): JobList {
  const summary = toSummary(job);
  const wasOpen = list.open.some((item) => item.id === job.id);
  const open = OPEN.has(job.status)
    ? wasOpen
      ? list.open.map((item) => (item.id === job.id ? summary : item))
      : [...list.open, summary]
    : list.open.filter((item) => item.id !== job.id);
  const others = list.done.filter((item) => item.id !== job.id);
  const done = FINISHED.has(job.status) ? [summary, ...others] : others;
  return { ...list, open, done };
}

/** A job fetched or changed on this phone: saved, with its row in the list brought up to date. */
export function withDetail(saved: SavedJobs, job: JobDetail, now: number): SavedJobs {
  return {
    uid: saved.uid,
    list: saved.list ? { savedAt: saved.list.savedAt, value: placed(saved.list.value, job) } : null,
    details: { ...saved.details, [job.id]: { savedAt: now, value: job } },
  };
}

/** A job that is no longer the technician's (declined, reassigned or removed). */
export function withoutJob(saved: SavedJobs, id: string): SavedJobs {
  const details = { ...saved.details };
  delete details[id];
  const list = saved.list
    ? {
        savedAt: saved.list.savedAt,
        value: {
          ...saved.list.value,
          open: saved.list.value.open.filter((job) => job.id !== id),
          done: saved.list.value.done.filter((job) => job.id !== id),
        },
      }
    : null;
  return { uid: saved.uid, list, details };
}
