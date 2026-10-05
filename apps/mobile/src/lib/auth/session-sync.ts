import { ApiError } from '@/lib/api/client';
import { authErrorCode } from './auth-errors';
import { parseMobileSession, type MobileSession } from './mobile-session';

/**
 * Rules for opening the app from the last account check when ServiceFlow
 * can't be reached. Pure functions, so they're unit tested.
 */

export const SESSION_CACHE_KEY = 'serviceflow.session.v1';
/** How long a saved account check may open the app without reaching ServiceFlow. */
export const OFFLINE_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Re-check the account when the app comes back if the last check is older than this. */
export const RECHECK_AFTER_MS = 5 * 60 * 1000;
/** While the app stays open and online, check again this often. */
export const RECHECK_EVERY_MS = 15 * 60 * 1000;
/** Allow for phones whose clock runs a little fast. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000];

/** Why the account couldn't be checked; screens turn it into a message in the chosen language. */
export type ErrorReason = 'network' | 'server' | 'unexpected' | 'config' | 'startup';

/** The last successful account check for one user, saved on the phone. */
export interface CachedSession {
  uid: string;
  checkedAt: number;
  session: MobileSession;
}

export function serializeCachedSession(entry: CachedSession): string {
  return JSON.stringify({ uid: entry.uid, checkedAt: entry.checkedAt, session: entry.session });
}

/**
 * The saved check, only if it belongs to this user, still allows access and
 * isn't too old (or dated in the future).
 */
export function readCachedSession(raw: string | null | undefined, uid: string, now: number): CachedSession | null {
  if (!raw || !uid) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const checkedAt = record.checkedAt;
  if (record.uid !== uid || typeof checkedAt !== 'number' || !Number.isFinite(checkedAt)) return null;
  if (now - checkedAt > OFFLINE_SESSION_MAX_AGE_MS || checkedAt - now > CLOCK_SKEW_MS) return null;
  const session = parseMobileSession(record.session);
  if (!session || session.access !== 'ALLOWED' || session.user.uid !== uid) return null;
  return { uid, checkedAt, session };
}

export type CheckFailure =
  /** The sign-in is no longer valid: sign out. */
  | { kind: 'ended' }
  | { kind: 'unverified' }
  | { kind: 'unavailable'; reason: string | null }
  /** ServiceFlow couldn't answer; a saved check may be shown meanwhile. */
  | { kind: 'transient'; reason: ErrorReason };

/** Firebase errors meaning the stored sign-in is no longer valid. */
const ENDED_CODES = new Set(['auth/user-token-expired', 'auth/user-disabled', 'auth/invalid-user-token', 'auth/user-not-found']);

export function isSignInEnded(error: unknown): boolean {
  const code = authErrorCode(error);
  return code !== null && ENDED_CODES.has(code);
}

export function classifyCheckError(error: unknown): CheckFailure {
  if (error instanceof ApiError) {
    if (error.status === 401) return { kind: 'ended' };
    if (error.code === 'EMAIL_NOT_VERIFIED') return { kind: 'unverified' };
    if (error.code === 'ACCOUNT_UNAVAILABLE') return { kind: 'unavailable', reason: error.reason };
    if (error.code === 'NETWORK') return { kind: 'transient', reason: 'network' };
    if (error.code === 'CONFIG') return { kind: 'transient', reason: 'config' };
    if (error.code === 'INVALID_RESPONSE') return { kind: 'transient', reason: 'unexpected' };
    return { kind: 'transient', reason: 'server' };
  }
  if (isSignInEnded(error)) return { kind: 'ended' };
  return { kind: 'transient', reason: authErrorCode(error) === 'auth/network-request-failed' ? 'network' : 'unexpected' };
}

/** Wait before retrying a failed check: 30 s, 1 min, 2 min, then every 5 min. */
export function retryDelay(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempt, 0), RETRY_DELAYS_MS.length - 1)];
}

/** Whether to check again now, for example when the app comes back to the front. */
export function isCheckDue(sync: { checkedAt: number; connection: 'online' | 'offline' | 'unavailable' }, now: number): boolean {
  return sync.connection !== 'online' || now - sync.checkedAt >= RECHECK_AFTER_MS;
}
