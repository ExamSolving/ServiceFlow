import "server-only";
import { notFound } from "next/navigation";
import { requireAuth } from "./require-auth";
import { hasPermission, type Permission } from "./permissions";

// Call at every protected page/data/mutation boundary, even if navigation is hidden.
export async function requirePermission(permission: Permission) {
  const session = await requireAuth();
  if (!hasPermission(session.role, permission)) notFound();
  return session;
}
