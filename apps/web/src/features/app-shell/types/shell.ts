import type { AppSession } from "@/src/features/auth/types/app-session";

// Only presentation fields cross the server/client boundary. No cookie or token.
export type ShellIdentity = Pick<
  AppSession,
  "displayName" | "email" | "organizationName" | "role"
>;
export interface BreadcrumbItem {
  label: string;
  href?: string;
}
