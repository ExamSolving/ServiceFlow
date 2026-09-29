export type CustomerType = "INDIVIDUAL" | "BUSINESS";
export type CustomerStatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

export interface CustomerFormValues {
  type: CustomerType;
  name: string;
  email: string;
  phone: string;
  notes: string;
  isActive: boolean;
}

export interface CustomerDetail extends CustomerFormValues {
  id: string;
  customerNumber: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerListFilters {
  q: string;
  status: CustomerStatusFilter;
  cursor?: string;
}

export interface CustomerListData {
  customers: CustomerDetail[];
  filters: CustomerListFilters;
  nextCursor: string | null;
  filterError?: string;
}

export type CustomerSearchParams = Record<string, string | string[] | undefined>;
