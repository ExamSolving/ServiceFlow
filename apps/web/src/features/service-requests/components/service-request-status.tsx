import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { ServiceRequestPriority as Priority, ServiceRequestStatus as Status } from "../types/service-request";

export const serviceRequestStatusOptions: { value: Status; label: string; variant: BadgeVariant; description: string }[] = [
  { value: "NEW", label: "New", variant: "info", description: "Logged and waiting for your operations team to review." },
  { value: "REVIEWING", label: "Reviewing", variant: "attention", description: "Being assessed before scheduling." },
  { value: "SCHEDULED", label: "Scheduled", variant: "positive", description: "A visit has been planned for this request." },
  { value: "CONVERTED_TO_JOB", label: "Converted to job", variant: "positive", description: "This request is now tracked as a job." },
  { value: "CANCELLED", label: "Cancelled", variant: "neutral", description: "Closed without scheduling. The record is retained." },
];

export const serviceRequestPriorityOptions: { value: Priority; label: string; variant: BadgeVariant; description: string }[] = [
  { value: "LOW", label: "Low", variant: "outline", description: "Can wait for a convenient slot." },
  { value: "NORMAL", label: "Normal", variant: "neutral", description: "Handle in the usual order." },
  { value: "HIGH", label: "High", variant: "attention", description: "Schedule ahead of normal work." },
  { value: "URGENT", label: "Urgent", variant: "destructive", description: "Needs attention as soon as possible." },
];

export function ServiceRequestStatus({ status }: { status: Status }) {
  const option = serviceRequestStatusOptions.find((item) => item.value === status)!;
  return <Badge variant={option.variant}>{option.label}</Badge>;
}

export function ServiceRequestPriority({ priority }: { priority: Priority }) {
  const option = serviceRequestPriorityOptions.find((item) => item.value === priority)!;
  return <Badge variant={option.variant}>{option.label}</Badge>;
}

export const formatRequestDate = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
