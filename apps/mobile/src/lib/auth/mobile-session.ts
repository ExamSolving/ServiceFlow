import type { User } from 'firebase/auth';

import { ApiError, apiRequest, isRecord } from '@/lib/api/client';

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'DISPATCHER' | 'TECHNICIAN' | 'ACCOUNTANT';
export type TechnicianStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'ON_LEAVE' | 'INACTIVE';

/**
 * Whether this member can use the technician app. Mirrors MobileAccess in
 * apps/web/src/features/mobile/types/mobile-session.ts.
 */
export type MobileAccess = 'ALLOWED' | 'ROLE_NOT_SUPPORTED' | 'PROFILE_MISSING' | 'PROFILE_INACTIVE';

export interface MobileTechnician {
  id: string;
  displayName: string;
  employeeNumber: string;
  status: TechnicianStatus;
}

/** The account summary returned by GET /api/mobile/session. */
export interface MobileSession {
  user: { uid: string; email: string; displayName: string };
  organization: { id: string; name: string; timezone: string };
  role: OrganizationRole;
  access: MobileAccess;
  technician: MobileTechnician | null;
}

const ROLES: readonly OrganizationRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'DISPATCHER', 'TECHNICIAN', 'ACCOUNTANT'];
const STATUSES: readonly TechnicianStatus[] = ['AVAILABLE', 'BUSY', 'OFFLINE', 'ON_LEAVE', 'INACTIVE'];
const ACCESS: readonly MobileAccess[] = ['ALLOWED', 'ROLE_NOT_SUPPORTED', 'PROFILE_MISSING', 'PROFILE_INACTIVE'];

function oneOf<T extends string>(values: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseTechnician(value: unknown): MobileTechnician | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const displayName = text(value.displayName);
  const employeeNumber = text(value.employeeNumber);
  const status = oneOf(STATUSES, value.status);
  return id && displayName && employeeNumber !== null && status ? { id, displayName, employeeNumber, status } : null;
}

/** Check the server's answer field by field, so a malformed response never reaches the screens. */
export function parseMobileSession(value: unknown): MobileSession | null {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.organization)) return null;
  const uid = text(value.user.uid);
  const email = text(value.user.email);
  const displayName = text(value.user.displayName);
  const organizationId = text(value.organization.id);
  const organizationName = text(value.organization.name);
  const timezone = text(value.organization.timezone);
  const role = oneOf(ROLES, value.role);
  const access = oneOf(ACCESS, value.access);
  if (!uid || email === null || displayName === null || !organizationId || organizationName === null || !timezone || !role || !access) return null;

  const technician = value.technician === null ? null : parseTechnician(value.technician);
  if (value.technician !== null && !technician) return null;
  if ((access === 'ALLOWED' || access === 'PROFILE_INACTIVE') && !technician) return null;

  return {
    user: { uid, email, displayName },
    organization: { id: organizationId, name: organizationName, timezone },
    role,
    access,
    technician,
  };
}

/**
 * Ask ServiceFlow who this Firebase user is. The ID token is sent as a Bearer
 * token; if the server reports it expired, retry once with a fresh one.
 */
export async function fetchMobileSession(user: User, forceRefresh = false): Promise<MobileSession> {
  const load = async (refreshToken: boolean) => {
    const token = await user.getIdToken(refreshToken);
    const data = await apiRequest<unknown>('/api/mobile/session', { token });
    const session = isRecord(data) ? parseMobileSession(data.session) : null;
    if (!session) throw new ApiError(502, 'INVALID_RESPONSE', 'ServiceFlow sent an unexpected response. Please try again.');
    return session;
  };
  try {
    return await load(forceRefresh);
  } catch (error) {
    if (!forceRefresh && error instanceof ApiError && error.code === 'TOKEN_EXPIRED') return load(true);
    throw error;
  }
}
