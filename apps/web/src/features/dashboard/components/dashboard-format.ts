import type { BadgeVariant } from "@/components/ui/badge";
import type { JobStatus, TechnicianStatus } from "../types/dashboard";

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  NEW: "New",
  ASSIGNED: "Assigned",
  ACCEPTED: "Accepted",
  EN_ROUTE: "En route",
  ARRIVED: "Arrived",
  DIAGNOSING: "Diagnosing",
  QUOTATION_REQUIRED: "Quote needed",
  WAITING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  INVOICED: "Invoiced",
  PARTIAL: "Partially paid",
  PAID: "Paid",
  CLOSED: "Closed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  RESCHEDULED: "Rescheduled",
};

const TECHNICIAN_STATUS_LABELS: Record<TechnicianStatus, string> = {
  AVAILABLE: "Available",
  BUSY: "Busy",
  OFFLINE: "Offline",
  ON_LEAVE: "On leave",
  INACTIVE: "Inactive",
};

export function jobStatusLabel(status: JobStatus) {
  return JOB_STATUS_LABELS[status];
}

export function technicianStatusLabel(status: TechnicianStatus) {
  return TECHNICIAN_STATUS_LABELS[status];
}

export function jobStatusVariant(status: JobStatus): BadgeVariant {
  if (["COMPLETED", "PAID", "CLOSED"].includes(status)) return "positive";
  if (
    ["ON_HOLD", "WAITING_APPROVAL", "QUOTATION_REQUIRED"].includes(status)
  ) {
    return "attention";
  }
  if (["CANCELLED", "REJECTED"].includes(status)) return "destructive";
  if (["IN_PROGRESS", "EN_ROUTE", "ARRIVED", "DIAGNOSING"].includes(status)) {
    return "info";
  }
  return "neutral";
}

export function technicianStatusClass(status: TechnicianStatus) {
  if (status === "AVAILABLE") return "bg-primary";
  if (status === "BUSY") return "bg-accent-foreground";
  if (status === "ON_LEAVE") return "bg-muted-foreground/60";
  return "bg-border";
}

export function formatTime(value: string | null, timezone: string) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatGeneratedAt(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
