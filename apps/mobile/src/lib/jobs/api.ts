import type { User } from 'firebase/auth';

import { ApiError, apiRequest, isRecord } from '@/lib/api/client';

import { parseJobDetail, parseJobList, parseJobNote } from './parse';
import type { JobDetail, JobList, JobNote, MoveRequest } from './types';

/** Calls to /api/mobile/jobs. The Firebase ID token travels as a Bearer token; an expired one is refreshed once. */

type TokenSource = Pick<User, 'getIdToken'>;

async function withToken<T>(user: TokenSource, call: (token: string) => Promise<T>): Promise<T> {
  try {
    return await call(await user.getIdToken());
  } catch (error) {
    if (error instanceof ApiError && error.code === 'TOKEN_EXPIRED') return call(await user.getIdToken(true));
    throw error;
  }
}

const unexpected = () => new ApiError(502, 'INVALID_RESPONSE', 'ServiceFlow sent an unexpected response. Please try again.');
const jobPath = (id: string) => `/api/mobile/jobs/${encodeURIComponent(id)}`;

export function fetchJobList(user: TokenSource): Promise<JobList> {
  return withToken(user, async (token) => {
    const data = await apiRequest<unknown>('/api/mobile/jobs', { token });
    const list = isRecord(data) ? parseJobList(data.jobs) : null;
    if (!list) throw unexpected();
    return list;
  });
}

export function fetchJob(user: TokenSource, id: string): Promise<JobDetail> {
  return withToken(user, async (token) => {
    const data = await apiRequest<unknown>(jobPath(id), { token });
    const job = isRecord(data) ? parseJobDetail(data.job) : null;
    if (!job || job.id !== id) throw unexpected();
    return job;
  });
}

/** Send a status move. Resolves to the updated job, or null after a decline (the job has left the technician's list). */
export function sendMove(user: TokenSource, id: string, move: MoveRequest): Promise<JobDetail | null> {
  return withToken(user, async (token) => {
    const data = await apiRequest<unknown>(`${jobPath(id)}/status`, { token, method: 'POST', body: move });
    if (!isRecord(data) || !('job' in data)) throw unexpected();
    if (data.job === null) return null;
    const job = parseJobDetail(data.job);
    if (!job || job.id !== id) throw unexpected();
    return job;
  });
}

export function sendNote(user: TokenSource, id: string, note: { body: string; requestId: string }): Promise<JobNote> {
  return withToken(user, async (token) => {
    const data = await apiRequest<unknown>(`${jobPath(id)}/notes`, { token, method: 'POST', body: note });
    const saved = isRecord(data) ? parseJobNote(data.note) : null;
    if (!saved) throw unexpected();
    return saved;
  });
}

/** What a failed jobs request means for the app. */
export type JobFailure =
  /** No connection, or the server couldn't answer: try again later. */
  | 'offline'
  | 'server'
  /** The job changed or moved on: reload it. */
  | 'changed'
  /** Not the technician's job anymore: remove it. */
  | 'gone'
  | 'reasonRequired'
  /** The sign-in or the account needs checking again. */
  | 'account';

export function classifyJobError(error: unknown): JobFailure {
  if (!(error instanceof ApiError)) return 'server';
  if (error.code === 'NETWORK') return 'offline';
  if (error.code === 'CONFLICT' || error.code === 'STATE') return 'changed';
  if (error.status === 404) return 'gone';
  if (error.code === 'REASON_REQUIRED') return 'reasonRequired';
  if (error.status === 401 || error.status === 403) return 'account';
  return 'server';
}
