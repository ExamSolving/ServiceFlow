import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { InvitationStatus, MemberStatus } from "../types/member";

const MEMBER_STATUS: Record<MemberStatus, { label: string; variant: BadgeVariant }> = {
  ACTIVE: { label: "Active", variant: "positive" },
  INVITED: { label: "Invited", variant: "attention" },
  SUSPENDED: { label: "Suspended", variant: "destructive" },
};

const INVITATION_STATUS: Record<InvitationStatus, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: "Pending", variant: "attention" },
  ACCEPTED: { label: "Accepted", variant: "positive" },
  REVOKED: { label: "Revoked", variant: "neutral" },
  EXPIRED: { label: "Expired", variant: "destructive" },
};

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  const option = MEMBER_STATUS[status];
  return <Badge variant={option.variant}>{option.label}</Badge>;
}

export function InvitationStatusBadge({ status }: { status: InvitationStatus }) {
  const option = INVITATION_STATUS[status];
  return <Badge variant={option.variant}>{option.label}</Badge>;
}

export const formatMemberDate = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
