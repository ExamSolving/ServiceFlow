export type JobStatus =
  | "NEW"
  | "ASSIGNED"
  | "ACCEPTED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "DIAGNOSING"
  | "QUOTATION_REQUIRED"
  | "WAITING_APPROVAL"
  | "APPROVED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "COMPLETED"
  | "INVOICED"
  | "PARTIAL"
  | "PAID"
  | "CLOSED"
  | "REJECTED"
  | "CANCELLED"
  | "RESCHEDULED";
export type JobPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type TechnicianStatus =
  | "AVAILABLE"
  | "BUSY"
  | "OFFLINE"
  | "ON_LEAVE"
  | "INACTIVE";
export type DashboardSection<T> = { status: "ready"; data: T } | { status: "error"; message: string } | { status: "unavailable"; message: string };
export interface DashboardJob { id: string; jobNumber: string; title: string; status: JobStatus; priority: JobPriority; scheduledAt: string | null; createdAt: string }
export interface DashboardTechnician { id: string; displayName: string; status: TechnicianStatus }
export interface DashboardOperations {
  scope: "organization" | "assigned";
  todayJobs: number;
  schedule: DashboardJob[];
  recentJobs: DashboardJob[];
  waitingApproval: number;
  onHold: number;
  newJobs: number;
}
export interface DashboardTeam { activeCount: number; technicians: DashboardTechnician[] }
export interface DashboardFinance { pendingQuotations: number; outstandingInvoices: number }
export interface DashboardData {
  date: string;
  today: string;
  timezone: string;
  timezoneDefaulted: boolean;
  generatedAt: string;
  filterError?: string;
  operations: DashboardSection<DashboardOperations> | null;
  team: DashboardSection<DashboardTeam> | null;
  requests: DashboardSection<{openCount: number}> | null;
  finance: DashboardSection<DashboardFinance> | null;
}
