export type OrganizationRole =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "DISPATCHER"
  | "TECHNICIAN"
  | "ACCOUNTANT"
  | "CUSTOMER";

export interface Membership {
  id: string;
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  createdAt: Date;
  updatedAt: Date;
}
