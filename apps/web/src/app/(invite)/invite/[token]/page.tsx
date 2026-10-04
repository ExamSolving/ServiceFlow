import type { Metadata } from "next";

import { InviteAcceptView } from "@/src/features/members/components/invite-accept-view";
import { getInvitationPreview } from "@/src/features/members/services/member.service";
import { getAppSession } from "@/src/lib/auth/app-session";

export const metadata: Metadata = { title: "Join a workspace" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, session] = await Promise.all([getInvitationPreview(token), getAppSession()]);
  return (
    <InviteAcceptView
      token={token}
      preview={preview}
      signedInAs={session ? { email: session.email, organizationName: session.organizationName } : null}
    />
  );
}
