import type { OrganizationRole } from "@/src/features/auth/types/app-session";

export type TechnicianStatus = "AVAILABLE" | "BUSY" | "OFFLINE" | "ON_LEAVE" | "INACTIVE";

/**
 * Whether the signed-in member can use the technician app:
 * ALLOWED — technician with an active profile;
 * ROLE_NOT_SUPPORTED — any office role (they use the web admin);
 * PROFILE_MISSING — technician member without a technician profile yet;
 * PROFILE_INACTIVE — technician profile set to Inactive.
 */
export type MobileAccess = "ALLOWED" | "ROLE_NOT_SUPPORTED" | "PROFILE_MISSING" | "PROFILE_INACTIVE";

export interface MobileTechnician {
  id: string;
  displayName: string;
  employeeNumber: string;
  status: TechnicianStatus;
}

export interface MobileSessionPayload {
  user: { uid: string; email: string; displayName: string };
  organization: { id: string; name: string; timezone: string };
  role: OrganizationRole;
  access: MobileAccess;
  technician: MobileTechnician | null;
}
