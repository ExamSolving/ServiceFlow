export type OrganizationRole =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "DISPATCHER"
  | "TECHNICIAN"
  | "ACCOUNTANT";

export interface AppSession {
  uid: string;
  email: string;
  displayName: string;

  organizationId: string;
  organizationName: string;

  membershipId: string;

  role: OrganizationRole;
}
