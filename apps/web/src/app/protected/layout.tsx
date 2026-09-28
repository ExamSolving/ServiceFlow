import { requireAuth } from "@/src/lib/auth/require-auth";
import { getNavigation } from "@/src/features/app-shell/config/navigation";
import { ApplicationShell } from "@/src/features/app-shell/components/application-shell";
import type { ShellIdentity } from "@/src/features/app-shell/types/shell";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  const identity: ShellIdentity = {
    displayName: session.displayName,
    email: session.email,
    organizationName: session.organizationName,
    role: session.role,
  };
  return (
    <ApplicationShell
      identity={identity}
      navigation={getNavigation(session.role)}
    >
      {children}
    </ApplicationShell>
  );
}
