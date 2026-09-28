export interface Technician {
  id: string;
  organizationId: string;
  userId: string;

  employeeNumber: string;

  displayName: string;
  phone?: string;

  status: "AVAILABLE" | "BUSY" | "OFFLINE" | "ON_LEAVE" | "INACTIVE";

  createdAt: Date;
  updatedAt: Date;
}
