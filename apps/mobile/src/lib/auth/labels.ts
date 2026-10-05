import type { OrganizationRole, TechnicianStatus } from './mobile-session';

/** Translation key for a role name, for example "roles.TECHNICIAN". */
export function roleKey(role: OrganizationRole): `roles.${OrganizationRole}` {
  return `roles.${role}`;
}

/** Translation key for an availability status, matching the web admin's status badges. */
export function statusKey(status: TechnicianStatus): `technicianStatus.${TechnicianStatus}` {
  return `technicianStatus.${status}`;
}
