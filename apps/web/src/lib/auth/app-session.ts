import "server-only";
import { cache } from "react";

import { adminDb } from "@/src/lib/firebase/admin";
import { getFirebaseSession } from "@/src/lib/auth/session";

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

// Share this lookup across the layout and page only within the current render.
export const getAppSession = cache(async (): Promise<AppSession | null> => {
  /*
   * 1. Verify Firebase session cookie
   */
  const firebaseSession = await getFirebaseSession();

  if (!firebaseSession) {
    return null;
  }

  const uid = firebaseSession.uid;

  /*
   * 2. Load ServiceFlow user profile
   */
  const userSnapshot = await adminDb.collection("users").doc(uid).get();

  if (!userSnapshot.exists) {
    console.warn(`[AUTH] ServiceFlow user not found for uid: ${uid}`);

    return null;
  }

  const user = userSnapshot.data();

  if (!user || user.isActive !== true) {
    console.warn(`[AUTH] User is inactive: ${uid}`);

    return null;
  }

  /*
   * 3. Resolve current organization
   */
  const organizationId = user.defaultOrganizationId;

  if (typeof organizationId !== "string" || !organizationId) {
    console.warn(`[AUTH] User has no default organization: ${uid}`);

    return null;
  }

  /*
   * 4. Resolve membership
   */
  const membershipId = `${organizationId}_${uid}`;

  const [membershipSnapshot, organizationSnapshot] = await Promise.all([
    adminDb.collection("memberships").doc(membershipId).get(),
    adminDb.collection("organizations").doc(organizationId).get(),
  ]);

  if (!membershipSnapshot.exists) {
    console.warn(`[AUTH] Membership not found: ${membershipId}`);

    return null;
  }

  const membership = membershipSnapshot.data();

  if (!membership || membership.status !== "ACTIVE") {
    console.warn(`[AUTH] Membership inactive: ${membershipId}`);

    return null;
  }

  /*
   * Prevent malformed/cross-tenant
   * membership records.
   */
  if (
    membership.userId !== uid ||
    membership.organizationId !== organizationId
  ) {
    console.error(`[AUTH] Invalid membership relation: ${membershipId}`);

    return null;
  }

  if (!isOrganizationRole(membership.role)) {
    console.error(`[AUTH] Invalid role for membership: ${membershipId}`);

    return null;
  }

  /*
   * 5. Validate organization
   */
  if (!organizationSnapshot.exists) {
    console.warn(`[AUTH] Organization not found: ${organizationId}`);

    return null;
  }

  const organization = organizationSnapshot.data();

  if (!organization || organization.status !== "ACTIVE") {
    console.warn(`[AUTH] Organization inactive: ${organizationId}`);

    return null;
  }

  /*
   * 6. Return our application-level session
   */
  return {
    uid,

    email: user.email ?? firebaseSession.email ?? "",

    displayName: user.displayName ?? firebaseSession.name ?? "",

    organizationId,

    organizationName: organization.name ?? "",

    membershipId,

    role: membership.role,
  };
});
