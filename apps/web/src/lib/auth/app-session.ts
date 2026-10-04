import "server-only";
import { cache } from "react";

import { adminDb } from "@/src/lib/firebase/admin";
import { getFirebaseSession } from "@/src/lib/auth/session";
import { logger } from "@/src/lib/observability/logger";

import type {
  AppSession,
  OrganizationRole,
} from "@/src/features/auth/types/app-session";

const VALID_ROLES: OrganizationRole[] = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "DISPATCHER",
  "TECHNICIAN",
  "ACCOUNTANT",
];

function isOrganizationRole(value: unknown): value is OrganizationRole {
  return (
    typeof value === "string" && VALID_ROLES.includes(value as OrganizationRole)
  );
}

/** Why a signed-in Firebase user has no usable ServiceFlow session. */
export type AccountUnavailableReason =
  | "PROFILE_MISSING"
  | "USER_INACTIVE"
  | "NO_ORGANIZATION"
  | "MEMBERSHIP_MISSING"
  | "MEMBERSHIP_INACTIVE"
  | "MEMBERSHIP_INVALID"
  | "ORGANIZATION_MISSING"
  | "ORGANIZATION_INACTIVE";

export type AppSessionState =
  | { kind: "anonymous" }
  | { kind: "unavailable"; reason: AccountUnavailableReason }
  | { kind: "active"; session: AppSession };

export interface FirebaseIdentity {
  uid: string;
  email?: string;
  name?: string;
}

/**
 * Resolve the application session for a verified Firebase identity:
 * user profile → default organization → membership → organization.
 * Shared by cookie-based requests and by the session route, which must
 * refuse to mint a cookie for an account that cannot be resolved.
 */
export async function resolveAppSession(
  identity: FirebaseIdentity,
): Promise<{ session: AppSession } | { reason: AccountUnavailableReason }> {
  const { uid } = identity;

  const userSnapshot = await adminDb.collection("users").doc(uid).get();
  if (!userSnapshot.exists) {
    logger.warn("AUTH", "ServiceFlow user not found", { uid });
    return { reason: "PROFILE_MISSING" };
  }
  const user = userSnapshot.data();
  if (!user || user.isActive !== true) {
    logger.warn("AUTH", "User is inactive", { uid });
    return { reason: "USER_INACTIVE" };
  }

  const organizationId = user.defaultOrganizationId;
  if (typeof organizationId !== "string" || !organizationId) {
    logger.warn("AUTH", "User has no default organization", { uid });
    return { reason: "NO_ORGANIZATION" };
  }

  const membershipId = `${organizationId}_${uid}`;
  const [membershipSnapshot, organizationSnapshot] = await Promise.all([
    adminDb.collection("memberships").doc(membershipId).get(),
    adminDb.collection("organizations").doc(organizationId).get(),
  ]);

  if (!membershipSnapshot.exists) {
    logger.warn("AUTH", "Membership not found", { membershipId });
    return { reason: "MEMBERSHIP_MISSING" };
  }
  const membership = membershipSnapshot.data();
  if (!membership || membership.status !== "ACTIVE") {
    logger.warn("AUTH", "Membership inactive", { membershipId });
    return { reason: "MEMBERSHIP_INACTIVE" };
  }
  // Prevent malformed or cross-tenant membership records.
  if (membership.userId !== uid || membership.organizationId !== organizationId) {
    logger.error("AUTH", "Invalid membership relation", undefined, { membershipId });
    return { reason: "MEMBERSHIP_INVALID" };
  }
  if (!isOrganizationRole(membership.role)) {
    logger.error("AUTH", "Invalid role for membership", undefined, { membershipId });
    return { reason: "MEMBERSHIP_INVALID" };
  }

  if (!organizationSnapshot.exists) {
    logger.warn("AUTH", "Organization not found", { organizationId });
    return { reason: "ORGANIZATION_MISSING" };
  }
  const organization = organizationSnapshot.data();
  if (!organization || organization.status !== "ACTIVE") {
    logger.warn("AUTH", "Organization inactive", { organizationId });
    return { reason: "ORGANIZATION_INACTIVE" };
  }

  return {
    session: {
      uid,
      email: user.email ?? identity.email ?? "",
      displayName: user.displayName ?? identity.name ?? "",
      organizationId,
      organizationName: organization.name ?? "",
      membershipId,
      role: membership.role,
    },
  };
}

// Shared across the layout, page and handlers only within the current render.
export const getAppSessionState = cache(async (): Promise<AppSessionState> => {
  const firebaseSession = await getFirebaseSession();
  if (!firebaseSession) return { kind: "anonymous" };
  const resolved = await resolveAppSession({
    uid: firebaseSession.uid,
    email: firebaseSession.email,
    name: typeof firebaseSession.name === "string" ? firebaseSession.name : undefined,
  });
  return "session" in resolved
    ? { kind: "active", session: resolved.session }
    : { kind: "unavailable", reason: resolved.reason };
});

export const getAppSession = cache(async (): Promise<AppSession | null> => {
  const state = await getAppSessionState();
  return state.kind === "active" ? state.session : null;
});
