export interface Customer {
  id: string;
  organizationId: string;

  customerNumber: string;

  type: "INDIVIDUAL" | "BUSINESS";

  name: string;
  email?: string;
  phone: string;

  notes?: string;

  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}
