import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { FieldPath, Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { hasPermission } from "@/src/lib/auth/permissions";
import { adminDb } from "@/src/lib/firebase/admin";
import {
  INVITATION_TTL_DAYS, invitableRoles, invitationCreateSchema, invitationIdSchema, invitationStatuses, invitationTokenSchema,
  invitationVersionSchema, memberIdSchema, memberRoleUpdateSchema, memberStatusSchema, memberStatuses, normalizeEmail,
  type InvitationCreateInput, type InvitationVersionInput, type MemberRoleUpdateInput, type MemberStatusInput,
} from "../schemas/member.schema";
import type { InvitationDetail, InvitationPreview, InvitationWithLink, MemberRole, TeamData, TeamMember } from "../types/member";
import {
  InvitationNotFoundError, InvitationStateError, MemberAccessError, MemberConflictError, MemberNotFoundError, MemberRuleError,
} from "./member-errors";

const ALL_ROLES: readonly MemberRole[] = ["OWNER", "ADMIN", "MANAGER", "DISPATCHER", "TECHNICIAN", "ACCOUNTANT"];
const TEAM_LIMIT = 200;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const ttl = (now: Timestamp) => Timestamp.fromDate(new Date(now.toMillis() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000));

function assertSession(session: AppSession) {
  if (!invitationIdSchema.safeParse(session.organizationId).success || !invitationIdSchema.safeParse(session.uid).success || !hasPermission(session.role, "manageUsers")) {
    throw new MemberAccessError();
  }
}

function timestampToIso(value: unknown): string {
  if (!(value instanceof Timestamp)) throw new Error("Invalid member timestamp");
  return value.toDate().toISOString();
}

function isRole(value: unknown): value is MemberRole {
  return typeof value === "string" && (ALL_ROLES as readonly string[]).includes(value);
}

function toMember(snapshot: DocumentSnapshot, session: AppSession, profile?: { displayName?: string; email?: string }): TeamMember {
  const data = snapshot.data();
  // Ownership is checked before any field is read into the response.
  if (!snapshot.exists || !data || data.organizationId !== session.organizationId) throw new MemberNotFoundError();
  if (typeof data.userId !== "string" || snapshot.id !== `${session.organizationId}_${data.userId}` || !isRole(data.role) || !(memberStatuses as readonly string[]).includes(data.status)) {
    throw new Error("Invalid membership record");
  }
  const version = data.version ?? 1;
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("Invalid membership version");
  return {
    id: snapshot.id,
    userId: data.userId,
    displayName: typeof data.displayName === "string" && data.displayName ? data.displayName : profile?.displayName ?? "Team member",
    email: typeof data.email === "string" && data.email ? data.email : profile?.email ?? "",
    role: data.role,
    status: data.status,
    isSelf: data.userId === session.uid,
    version,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function toInvitation(snapshot: DocumentSnapshot, organizationId: string): InvitationDetail {
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.organizationId !== organizationId) throw new InvitationNotFoundError();
  if (typeof data.email !== "string" || !isRole(data.role) || !(invitationStatuses as readonly string[]).includes(data.status)) throw new Error("Invalid invitation record");
  const expiresAt = timestampToIso(data.expiresAt);
  const expired = data.status === "PENDING" && new Date(expiresAt).getTime() <= Date.now();
  return {
    id: snapshot.id,
    email: data.email,
    role: data.role,
    status: expired ? "EXPIRED" : data.status,
    invitedByName: typeof data.invitedByName === "string" ? data.invitedByName : "",
    expiresAt,
    version: data.version,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export async function listTeam(session: AppSession): Promise<TeamData> {
  assertSession(session);
  const [membershipSnapshot, invitationSnapshot] = await Promise.all([
    adminDb.collection("memberships").where("organizationId", "==", session.organizationId).orderBy(FieldPath.documentId(), "asc").limit(TEAM_LIMIT).get(),
    adminDb.collection("invitations").where("organizationId", "==", session.organizationId).where("status", "==", "PENDING").orderBy("createdAt", "desc").limit(50).get(),
  ]);
  // Memberships created before names were denormalised fall back to the profile.
  const missing = membershipSnapshot.docs.filter((document) => { const data = document.data(); return data.organizationId === session.organizationId && (!data.displayName || !data.email); });
  const profiles = new Map<string, { displayName?: string; email?: string }>();
  if (missing.length) {
    const users = await adminDb.getAll(...missing.map((document) => adminDb.collection("users").doc(String(document.data().userId))));
    for (const user of users) {
      const data = user.data();
      if (user.exists && data) profiles.set(user.id, { displayName: typeof data.displayName === "string" ? data.displayName : undefined, email: typeof data.email === "string" ? data.email : undefined });
    }
  }
  const members = membershipSnapshot.docs.map((document) => toMember(document, session, profiles.get(String(document.data().userId))));
  members.sort((left, right) => Number(right.role === "OWNER") - Number(left.role === "OWNER") || left.displayName.localeCompare(right.displayName));
  return {
    members,
    invitations: invitationSnapshot.docs.map((document) => toInvitation(document, session.organizationId)),
    viewer: { uid: session.uid, role: session.role },
  };
}

async function assertNoExistingMember(transaction: Transaction, session: AppSession, email: string) {
  const members = await transaction.get(adminDb.collection("memberships").where("organizationId", "==", session.organizationId).where("email", "==", email).limit(2));
  for (const member of members.docs) {
    const data = member.data();
    if (data.organizationId !== session.organizationId) throw new Error("Invalid membership tenant");
    if (data.status === "SUSPENDED") throw new MemberRuleError("MEMBER_SUSPENDED");
    throw new MemberRuleError("ALREADY_MEMBER");
  }
}

export async function createInvitation(session: AppSession, input: InvitationCreateInput): Promise<InvitationWithLink> {
  assertSession(session);
  const { requestId, ...values } = invitationCreateSchema.parse(input);
  const key = hash([session.organizationId, session.uid, requestId]);
  const payloadHash = hash(values);
  const invitationRef = adminDb.collection("invitations").doc(`inv_${key}`);
  const auditRef = adminDb.collection("auditLogs").doc();
  const token = randomBytes(32).toString("base64url");
  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(invitationRef);
    if (existing.exists) {
      const data = existing.data()!;
      if (data.createdBy !== session.uid || data.creationKey !== key || data.creationPayloadHash !== payloadHash) throw new MemberConflictError();
      // The clear-text token is never stored; a replay returns the record without a link.
      return { ...toInvitation(existing, session.organizationId), acceptPath: null };
    }
    await assertNoExistingMember(transaction, session, values.email);
    const pending = await transaction.get(adminDb.collection("invitations").where("organizationId", "==", session.organizationId).where("email", "==", values.email).where("status", "==", "PENDING").limit(5));
    const now = Timestamp.now();
    for (const document of pending.docs) {
      const data = document.data();
      if (data.organizationId !== session.organizationId) throw new Error("Invalid invitation tenant");
      if (data.expiresAt instanceof Timestamp && data.expiresAt.toMillis() > now.toMillis()) throw new MemberRuleError("INVITATION_PENDING");
    }
    for (const document of pending.docs) transaction.update(document.ref, { status: "EXPIRED", updatedAt: now });
    const record = {
      organizationId: session.organizationId,
      email: values.email,
      role: values.role,
      status: "PENDING" as const,
      tokenHash: hashToken(token),
      invitedBy: session.uid,
      invitedByName: session.displayName,
      expiresAt: ttl(now),
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: session.uid,
      creationKey: key,
      creationPayloadHash: payloadHash,
    };
    transaction.create(invitationRef, record);
    transaction.create(auditRef, {
      organizationId: session.organizationId, actorUserId: session.uid,
      action: "INVITATION_CREATED", entityType: "INVITATION", entityId: invitationRef.id,
      metadata: { role: values.role }, createdAt: now,
    });
    const iso = now.toDate().toISOString();
    return {
      id: invitationRef.id, email: values.email, role: values.role, status: "PENDING", invitedByName: session.displayName,
      expiresAt: ttl(now).toDate().toISOString(), version: 1, createdAt: iso, updatedAt: iso, acceptPath: `/invite/${token}`,
    };
  });
}

export async function regenerateInvitation(session: AppSession, invitationId: string, input: InvitationVersionInput): Promise<InvitationWithLink> {
  assertSession(session);
  if (!invitationIdSchema.safeParse(invitationId).success) throw new InvitationNotFoundError();
  const { version } = invitationVersionSchema.parse(input);
  const invitationRef = adminDb.collection("invitations").doc(invitationId);
  const auditRef = adminDb.collection("auditLogs").doc();
  const token = randomBytes(32).toString("base64url");
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(invitationRef);
    const current = toInvitation(snapshot, session.organizationId);
    if (current.version !== version) throw new MemberConflictError();
    if (current.status !== "PENDING" && current.status !== "EXPIRED") throw new InvitationStateError(current.status === "REVOKED" ? "REVOKED" : "ACCEPTED");
    const now = Timestamp.now();
    transaction.update(invitationRef, { tokenHash: hashToken(token), status: "PENDING", expiresAt: ttl(now), version: version + 1, updatedAt: now });
    transaction.create(auditRef, {
      organizationId: session.organizationId, actorUserId: session.uid,
      action: "INVITATION_LINK_REGENERATED", entityType: "INVITATION", entityId: invitationId,
      metadata: { version: version + 1 }, createdAt: now,
    });
    return { ...current, status: "PENDING", expiresAt: ttl(now).toDate().toISOString(), version: version + 1, updatedAt: now.toDate().toISOString(), acceptPath: `/invite/${token}` };
  });
}

export async function revokeInvitation(session: AppSession, invitationId: string, input: InvitationVersionInput): Promise<InvitationDetail> {
  assertSession(session);
  if (!invitationIdSchema.safeParse(invitationId).success) throw new InvitationNotFoundError();
  const { version } = invitationVersionSchema.parse(input);
  const invitationRef = adminDb.collection("invitations").doc(invitationId);
  const auditRef = adminDb.collection("auditLogs").doc();
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(invitationRef);
    const current = toInvitation(snapshot, session.organizationId);
    if (current.version !== version) throw new MemberConflictError();
    if (current.status === "ACCEPTED") throw new InvitationStateError("ACCEPTED");
    if (current.status === "REVOKED") return current;
    const now = Timestamp.now();
    transaction.update(invitationRef, { status: "REVOKED", version: version + 1, updatedAt: now });
    transaction.create(auditRef, {
      organizationId: session.organizationId, actorUserId: session.uid,
      action: "INVITATION_REVOKED", entityType: "INVITATION", entityId: invitationId,
      metadata: { version: version + 1 }, createdAt: now,
    });
    return { ...current, status: "REVOKED", version: version + 1, updatedAt: now.toDate().toISOString() };
  });
}

async function loadProtectedMember(transaction: Transaction, session: AppSession, membershipId: string, version: number) {
  const ref = adminDb.collection("memberships").doc(membershipId);
  const current = toMember(await transaction.get(ref), session);
  if (current.version !== version) throw new MemberConflictError();
  // The owner's access can never be changed from the team page; neither can your own.
  if (current.role === "OWNER") throw new MemberRuleError("OWNER_PROTECTED");
  if (current.isSelf) throw new MemberRuleError("SELF_CHANGE");
  return { ref, current };
}

export async function updateMemberRole(session: AppSession, membershipId: string, input: MemberRoleUpdateInput): Promise<TeamMember> {
  assertSession(session);
  if (!memberIdSchema.safeParse(membershipId).success) throw new MemberNotFoundError();
  const { role, version } = memberRoleUpdateSchema.parse(input);
  if (!(invitableRoles as readonly string[]).includes(role)) throw new MemberRuleError("OWNER_PROTECTED");
  const auditRef = adminDb.collection("auditLogs").doc();
  return adminDb.runTransaction(async (transaction) => {
    const { ref, current } = await loadProtectedMember(transaction, session, membershipId, version);
    if (current.role === role) return current;
    const now = Timestamp.now();
    transaction.update(ref, { role, version: version + 1, updatedAt: now });
    transaction.create(auditRef, {
      organizationId: session.organizationId, actorUserId: session.uid,
      action: "MEMBER_ROLE_CHANGED", entityType: "MEMBERSHIP", entityId: membershipId,
      metadata: { from: current.role, to: role, version: version + 1 }, createdAt: now,
    });
    return { ...current, role, version: version + 1, updatedAt: now.toDate().toISOString() };
  });
}

export async function setMemberStatus(session: AppSession, membershipId: string, input: MemberStatusInput): Promise<TeamMember> {
  assertSession(session);
  if (!memberIdSchema.safeParse(membershipId).success) throw new MemberNotFoundError();
  const { action, version } = memberStatusSchema.parse(input);
  const auditRef = adminDb.collection("auditLogs").doc();
  return adminDb.runTransaction(async (transaction) => {
    const { ref, current } = await loadProtectedMember(transaction, session, membershipId, version);
    const status = action === "SUSPEND" ? "SUSPENDED" : "ACTIVE";
    if (current.status === status) return current;
    if (action === "SUSPEND" && current.status !== "ACTIVE") throw new MemberConflictError();
    if (action === "REACTIVATE" && current.status !== "SUSPENDED") throw new MemberConflictError();
    const now = Timestamp.now();
    transaction.update(ref, { status, version: version + 1, updatedAt: now });
    transaction.create(auditRef, {
      organizationId: session.organizationId, actorUserId: session.uid,
      action: action === "SUSPEND" ? "MEMBER_SUSPENDED" : "MEMBER_REACTIVATED", entityType: "MEMBERSHIP", entityId: membershipId,
      metadata: { version: version + 1 }, createdAt: now,
    });
    return { ...current, status, version: version + 1, updatedAt: now.toDate().toISOString() };
  });
}

/** Public preview for the invitation page. Returns null for unknown or unusable links. */
export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  if (!invitationTokenSchema.safeParse(token).success) return null;
  const snapshot = await adminDb.collection("invitations").where("tokenHash", "==", hashToken(token)).limit(1).get();
  if (snapshot.empty) return null;
  const document = snapshot.docs[0];
  const data = document.data();
  if (data.status !== "PENDING" || !(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() <= Date.now() || typeof data.organizationId !== "string") return null;
  const organization = await adminDb.collection("organizations").doc(data.organizationId).get();
  const organizationData = organization.data();
  if (!organization.exists || !organizationData || organizationData.status !== "ACTIVE") return null;
  if (!isRole(data.role) || typeof data.email !== "string") return null;
  return { organizationName: String(organizationData.name ?? ""), role: data.role, email: data.email, expiresAt: data.expiresAt.toDate().toISOString() };
}

export interface AcceptIdentity { uid: string; email: string; displayName?: string }

/**
 * Accept an invitation for a verified Firebase user: creates or completes the
 * profile, creates the membership and closes the invitation in one transaction.
 */
export async function acceptInvitation(identity: AcceptIdentity, token: string): Promise<{ organizationId: string; organizationName: string }> {
  if (!invitationTokenSchema.safeParse(token).success || !invitationIdSchema.safeParse(identity.uid).success) throw new InvitationNotFoundError();
  const auditRef = adminDb.collection("auditLogs").doc();
  return adminDb.runTransaction(async (transaction) => {
    const found = await transaction.get(adminDb.collection("invitations").where("tokenHash", "==", hashToken(token)).limit(1));
    if (found.empty) throw new InvitationNotFoundError();
    const invitationSnapshot = found.docs[0];
    const invitation = invitationSnapshot.data();
    if (typeof invitation.organizationId !== "string" || typeof invitation.email !== "string" || !isRole(invitation.role)) throw new Error("Invalid invitation record");
    const organizationId = invitation.organizationId;
    const now = Timestamp.now();
    if (invitation.status === "REVOKED") throw new InvitationStateError("REVOKED");
    if (invitation.status === "ACCEPTED") throw new InvitationStateError("ACCEPTED");
    if (invitation.status !== "PENDING" || !(invitation.expiresAt instanceof Timestamp) || invitation.expiresAt.toMillis() <= now.toMillis()) throw new InvitationStateError("EXPIRED");
    if (normalizeEmail(identity.email) !== invitation.email) throw new InvitationStateError("EMAIL_MISMATCH");

    const organizationRef = adminDb.collection("organizations").doc(organizationId);
    const membershipRef = adminDb.collection("memberships").doc(`${organizationId}_${identity.uid}`);
    const userRef = adminDb.collection("users").doc(identity.uid);
    const [organizationSnapshot, membershipSnapshot, userSnapshot] = await Promise.all([
      transaction.get(organizationRef), transaction.get(membershipRef), transaction.get(userRef),
    ]);
    const organization = organizationSnapshot.data();
    if (!organizationSnapshot.exists || !organization || organization.status !== "ACTIVE") throw new InvitationNotFoundError();
    const organizationName = String(organization.name ?? "");
    const user = userSnapshot.data();
    const displayName = (typeof user?.displayName === "string" && user.displayName) || identity.displayName?.trim() || identity.email.split("@")[0];

    if (membershipSnapshot.exists) {
      const membership = membershipSnapshot.data()!;
      if (membership.status === "SUSPENDED") throw new MemberRuleError("MEMBER_SUSPENDED");
      // Already a member: just close the invitation.
      transaction.update(invitationSnapshot.ref, { status: "ACCEPTED", acceptedUserId: identity.uid, acceptedAt: now, version: (invitation.version ?? 1) + 1, updatedAt: now });
      return { organizationId, organizationName };
    }

    transaction.set(userRef, {
      email: user?.email ?? identity.email,
      displayName,
      phone: user?.phone ?? null,
      photoUrl: user?.photoUrl ?? null,
      isActive: true,
      ...(typeof user?.defaultOrganizationId === "string" && user.defaultOrganizationId ? {} : { defaultOrganizationId: organizationId }),
      ...(userSnapshot.exists ? {} : { createdAt: now }),
      updatedAt: now,
    }, { merge: true });
    transaction.create(membershipRef, {
      userId: identity.uid,
      organizationId,
      role: invitation.role,
      status: "ACTIVE",
      displayName,
      email: invitation.email,
      invitationId: invitationSnapshot.id,
      invitedBy: invitation.invitedBy ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    transaction.update(invitationSnapshot.ref, { status: "ACCEPTED", acceptedUserId: identity.uid, acceptedAt: now, version: (invitation.version ?? 1) + 1, updatedAt: now });
    transaction.create(auditRef, {
      organizationId, actorUserId: identity.uid,
      action: "MEMBER_JOINED", entityType: "MEMBERSHIP", entityId: membershipRef.id,
      metadata: { role: invitation.role, invitationId: invitationSnapshot.id }, createdAt: now,
    });
    return { organizationId, organizationName };
  });
}
