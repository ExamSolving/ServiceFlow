import { redirect } from "next/navigation";

import { AuthShell } from "@/src/features/auth/components/auth-shell";

import { getAppSession } from "@/src/lib/auth/app-session";

interface AuthLayoutProps {
  children: React.ReactNode;
}

// Only a fully resolved application session leaves the public pages. A valid
// cookie without a usable account renders them, so sign-in and sign-out stay
// reachable instead of redirecting back and forth with the protected layout.
export default async function AuthLayout({ children }: AuthLayoutProps) {
  const session = await getAppSession();

  if (session) {
    redirect("/dashboard");
  }

  return <AuthShell>{children}</AuthShell>;
}
