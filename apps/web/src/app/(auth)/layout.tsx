import { redirect } from "next/navigation";

import { AuthShell } from "@/src/features/auth/components/auth-shell";

import { getServerSession } from "@/src/lib/auth/session";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default async function AuthLayout({ children }: AuthLayoutProps) {
  const session = await getServerSession();

  if (session) {
    redirect("/dashboard");
  }

  return <AuthShell>{children}</AuthShell>;
}
