import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { TechnicianDetail } from "../types/technician";

export const technicianStatuses: { value: TechnicianDetail["status"]; label: string; variant: BadgeVariant; description: string }[] = [
  { value: "AVAILABLE", label: "Available", variant: "positive", description: "Ready to take on service work." },
  { value: "BUSY", label: "Busy", variant: "info", description: "Currently occupied with service work." },
  { value: "OFFLINE", label: "Offline", variant: "neutral", description: "Currently off duty or unavailable." },
  { value: "ON_LEAVE", label: "On leave", variant: "attention", description: "Temporarily away from work." },
  { value: "INACTIVE", label: "Inactive", variant: "outline", description: "Removed from active operations. Their record is retained." },
];

export function TechnicianStatus({ status }: { status: TechnicianDetail["status"] }) {
  const option = technicianStatuses.find((item) => item.value === status)!;
  return <Badge variant={option.variant}>{option.label}</Badge>;
}
