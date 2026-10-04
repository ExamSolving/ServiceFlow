import type { OrganizationRole } from "@/src/features/auth/types/app-session";

export type MemberRole = OrganizationRole;
export type MemberStatus = "ACTIVE" | "INVITED" | "SUSPENDED";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export interface TeamMember {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  isSelf: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationDetail {
  id: string;
  email: string;
  role: MemberRole;
  status: InvitationStatus;
  invitedByName: string;
  expiresAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Returned only when a link is minted; the token is never stored in clear. */
export interface InvitationWithLink extends InvitationDetail {
  acceptPath: string | null;
}

export interface TeamData {
  members: TeamMember[];
  invitations: InvitationDetail[];
  viewer: { uid: string; role: MemberRole };
}

export interface InvitationPreview {
  organizationName: string;
  role: MemberRole;
  email: string;
  expiresAt: string;
}
