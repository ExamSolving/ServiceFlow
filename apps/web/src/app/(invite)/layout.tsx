import { AuthShell } from "@/src/features/auth/components/auth-shell";

// Invitation links must stay reachable whether or not a session cookie exists,
// so this group does not redirect signed-in users like the (auth) group does.
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
