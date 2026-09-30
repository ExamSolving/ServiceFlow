export type TechnicianStatus = "AVAILABLE" | "BUSY" | "OFFLINE" | "ON_LEAVE" | "INACTIVE";
export type TechnicianStatusFilter = "ALL" | TechnicianStatus;

export interface TechnicianFormValues {
  displayName: string;
  phone: string;
  status: TechnicianStatus;
}

export interface TechnicianDetail extends TechnicianFormValues {
  id: string;
  userId: string;
  employeeNumber: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TechnicianListFilters {
  q: string;
  status: TechnicianStatusFilter;
  cursor?: string;
}

export interface TechnicianListData {
  technicians: TechnicianDetail[];
  filters: TechnicianListFilters;
  nextCursor: string | null;
  filterError?: string;
}

export interface TechnicianMemberOption {
  userId: string;
  displayName: string;
  email: string;
  linked: boolean;
}

export interface TechnicianFormContext {
  members: TechnicianMemberOption[];
  nextMemberCursor: string | null;
  memberCursor?: string;
  filterError?: string;
}

export type TechnicianSearchParams = Record<string, string | string[] | undefined>;
