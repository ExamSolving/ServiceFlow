import type { OrganizationRole } from "@/src/features/auth/types/app-session";

const ALL_ROLES: readonly OrganizationRole[] = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "DISPATCHER",
  "TECHNICIAN",
  "ACCOUNTANT",
];
const OPERATIONS: readonly OrganizationRole[] = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "DISPATCHER",
];

// Shared policy, not a substitute for calling requirePermission on the server.
export const PERMISSION_ROLES = {
  viewDashboard: ALL_ROLES,
  manageCustomers: OPERATIONS,
  manageTechnicians: ["OWNER", "ADMIN", "MANAGER"],
  manageServiceTypes: ["OWNER", "ADMIN", "MANAGER"],
  dispatchJobs: OPERATIONS,
  viewFinancials: ["OWNER", "ADMIN", "ACCOUNTANT"],
  manageInventory: ["OWNER", "ADMIN", "MANAGER"],
  manageOrganization: ["OWNER"],
  manageUsers: ["OWNER", "ADMIN"],
} as const satisfies Record<string, readonly OrganizationRole[]>;

export type Permission = keyof typeof PERMISSION_ROLES;
export const ROLE_LABELS: Record<OrganizationRole, string> = {
  OWNER: "Owner",
  ADMIN: "Administrator",
  MANAGER: "Manager",
  DISPATCHER: "Dispatcher",
  TECHNICIAN: "Technician",
  ACCOUNTANT: "Accountant",
};

export function hasPermission(
  role: OrganizationRole,
  permission: Permission,
): boolean {
  const allowed: readonly OrganizationRole[] = PERMISSION_ROLES[permission];
  return allowed.includes(role);
}
