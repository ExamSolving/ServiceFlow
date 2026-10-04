import { Mail, UsersRound } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { ROLE_LABELS } from "@/src/lib/auth/permissions";
import type { TeamData } from "../types/member";
import { InvitationActions } from "./invitation-actions";
import { InviteMemberForm } from "./invite-member-form";
import { MemberActions } from "./member-actions";
import { formatMemberDate, InvitationStatusBadge, MemberStatusBadge } from "./member-status";

export function TeamView({ data }: { data: TeamData }) {
  const active = data.members.filter((member) => member.status === "ACTIVE").length;
  return (
    <>
      <PageHeader
        title="Team"
        description="Invite colleagues, set their roles and manage who can sign in to this workspace."
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Administration" }, { label: "Team" }]}
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
        <Card className="gap-0 py-0">
          <section aria-labelledby="team-members-heading">
            <div className="border-b border-border p-4 sm:p-5">
              <SectionHeading id="team-members-heading" title="Members" description={`${active} active ${active === 1 ? "member" : "members"} · roles decide which modules each person can use.`} />
            </div>
            {data.members.length ? (
              <ul className="divide-y divide-border">
                {data.members.map((member) => (
                  <li key={member.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium break-words">{member.displayName}{member.isSelf && <span className="text-xs font-normal text-muted-foreground">(you)</span>}<MemberStatusBadge status={member.status} /></p>
                      <p className="mt-1 text-xs text-muted-foreground break-all">{member.email || "Email not available"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{ROLE_LABELS[member.role]} · joined <time dateTime={member.createdAt}>{formatMemberDate(member.createdAt)}</time></p>
                    </div>
                    <MemberActions key={`${member.id}:${member.version}`} member={member} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4 sm:p-5"><EmptyState icon={UsersRound} title="No members yet" description="Invite your first colleague with the form on the right." /></div>
            )}
          </section>
        </Card>
        <div className="space-y-5">
          <InviteMemberForm />
          <Card>
            <CardHeader className="border-b border-border"><SectionHeading title="Pending invitations" description="Links expire after 7 days. Regenerate to issue a fresh link." /></CardHeader>
            <CardContent>
              {data.invitations.length ? (
                <ul className="divide-y divide-border">
                  {data.invitations.map((invitation) => (
                    <li key={invitation.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Mail aria-hidden="true" className="size-4 text-muted-foreground" />
                        <span className="min-w-0 break-all text-sm font-medium">{invitation.email}</span>
                        <InvitationStatusBadge status={invitation.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">{ROLE_LABELS[invitation.role]} · invited by {invitation.invitedByName || "an administrator"} · {invitation.status === "EXPIRED" ? "expired" : "expires"} <time dateTime={invitation.expiresAt}>{formatMemberDate(invitation.expiresAt)}</time></p>
                      <InvitationActions key={`${invitation.id}:${invitation.version}`} invitation={invitation} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Mail} title="No pending invitations" description="Invitations you create will appear here until they are accepted." className="min-h-32" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
