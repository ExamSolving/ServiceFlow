export interface ServiceTypeFormValues {
  name: string;
  description: string;
  estimatedDurationMinutes: number;
  isActive: boolean;
}

export interface ServiceTypeDetail extends ServiceTypeFormValues {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceTypeListFilters {
  q: string;
  status: "ALL" | "ACTIVE" | "INACTIVE";
  cursor?: string;
}

export interface ServiceTypeListData {
  serviceTypes: ServiceTypeDetail[];
  filters: ServiceTypeListFilters;
  nextCursor: string | null;
  filterError?: string;
}

export type ServiceTypeSearchParams = Record<string, string | string[] | undefined>;
