import { AuthShell } from "@/src/features/auth/components/auth-shell";

interface OnboardingLayoutProps {
  children: React.ReactNode;
}

export default function OnboardingLayout({ children }: OnboardingLayoutProps) {
  return <AuthShell>{children}</AuthShell>;
}
