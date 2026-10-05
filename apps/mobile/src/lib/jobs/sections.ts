import { dayKey } from '@/lib/format';

import type { JobStatus, JobSummary } from './types';

/**
 * How the home screen groups open jobs, by status and by visit day in the
 * workspace's time zone. Pure, so it's unit tested.
 */

/** Field work has started, or the customer approved the quote: the job in hand. */
const IN_HAND: readonly JobStatus[] = ['EN_ROUTE', 'ARRIVED', 'DIAGNOSING', 'IN_PROGRESS', 'APPROVED'];
/** Waiting on the office, a quotation or parts. */
const WAITING: readonly JobStatus[] = ['QUOTATION_REQUIRED', 'WAITING_APPROVAL', 'ON_HOLD', 'RESCHEDULED'];

export interface JobDay {
  /** "YYYY-MM-DD" in the workspace's time zone. */
  day: string;
  jobs: JobSummary[];
}

export interface JobSections {
  now: JobSummary[];
  /** Today's visits, with missed earlier visits first. */
  today: JobSummary[];
  /** Later visits, by day. */
  upcoming: JobDay[];
  unscheduled: JobSummary[];
  waiting: JobSummary[];
}

const visitTime = (job: JobSummary) => (job.scheduledAt ? Date.parse(job.scheduledAt) : Number.POSITIVE_INFINITY);

/** Earliest visit first, jobs without a time last. */
export function byVisit(a: JobSummary, b: JobSummary): number {
  const difference = visitTime(a) - visitTime(b);
  if (difference) return difference;
  return a.jobNumber < b.jobNumber ? -1 : a.jobNumber > b.jobNumber ? 1 : 0;
}

export function groupJobs(open: readonly JobSummary[], timeZone: string, now: Date): JobSections {
  const today = dayKey(timeZone, now);
  const sections: JobSections = { now: [], today: [], upcoming: [], unscheduled: [], waiting: [] };
  const days = new Map<string, JobSummary[]>();
  for (const job of [...open].sort(byVisit)) {
    if (IN_HAND.includes(job.status)) sections.now.push(job);
    else if (WAITING.includes(job.status)) sections.waiting.push(job);
    else if (!job.scheduledAt) sections.unscheduled.push(job);
    else {
      const day = dayKey(timeZone, new Date(job.scheduledAt));
      if (day <= today) sections.today.push(job);
      else days.set(day, [...(days.get(day) ?? []), job]);
    }
  }
  sections.upcoming = [...days.entries()].map(([day, jobs]) => ({ day, jobs }));
  return sections;
}

/** A visit on an earlier day that hasn't started yet. */
export function isMissed(job: JobSummary, timeZone: string, now: Date): boolean {
  return (job.status === 'ASSIGNED' || job.status === 'ACCEPTED') && job.scheduledAt !== null && dayKey(timeZone, new Date(job.scheduledAt)) < dayKey(timeZone, now);
}
