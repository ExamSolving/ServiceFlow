import { requireAuth } from "@/src/lib/auth/require-auth";

interface ProtectedLayoutProps {
  children: React.ReactNode;
}

export default async function ProtectedLayout({
  children,
}: ProtectedLayoutProps) {
  await requireAuth();

  return children;
}
