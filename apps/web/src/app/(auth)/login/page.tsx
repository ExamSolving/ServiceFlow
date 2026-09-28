import type { Metadata } from "next";
import { LoginForm } from "@/src/features/auth/components/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return <LoginForm />;
}
