import type { Metadata } from "next";
import { LoginForm } from "@/src/features/auth/components/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  return <LoginForm accountUnavailable={reason === "account"} />;
}
