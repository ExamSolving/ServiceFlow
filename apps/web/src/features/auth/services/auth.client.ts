"use client";

import {
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { auth } from "@/src/lib/firebase/client";
import { connectAuthEmulatorIfNeeded } from "@/src/lib/firebase/emulator";
import { AuthError } from "./auth-error";

interface LoginInput {
  email: string;
  password: string;
}
interface RegisterOwnerInput {
  fullName: string;
  companyName: string;
  email: string;
  password: string;
}
interface ResetPasswordInput {
  email: string;
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
}

/**
 * Exchange the signed-in Firebase user's ID token for the HttpOnly server
 * session cookie. The server refuses accounts without an active workspace.
 */
export async function establishServerSession(user: User): Promise<void> {
  const idToken = await user.getIdToken();
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (response.ok) return;
  const body = await readJson(response);
  const code = typeof body?.code === "string" ? body.code : undefined;
  if (code === "ACCOUNT_UNAVAILABLE") throw new AuthError("ACCOUNT_UNAVAILABLE");
  if (code === "EMAIL_NOT_VERIFIED") throw new AuthError("EMAIL_NOT_VERIFIED");
  if (code === "RECENT_LOGIN_REQUIRED" || response.status === 401) throw new AuthError("RECENT_LOGIN_REQUIRED");
  throw new AuthError("SESSION_FAILED");
}

export async function requestPasswordReset({ email }: ResetPasswordInput): Promise<void> {
  connectAuthEmulatorIfNeeded();
  try {
    await sendPasswordResetEmail(auth, email.trim(), { url: `${window.location.origin}/login` });
  } catch (error: unknown) {
    // Do not reveal whether an account exists.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "auth/user-not-found") return;
    throw error;
  }
}

export async function registerOwner({ fullName, companyName, email, password }: RegisterOwnerInput) {
  connectAuthEmulatorIfNeeded();
  await setPersistence(auth, inMemoryPersistence);

  // Firebase owns the password.
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);

  try {
    await updateProfile(credential.user, { displayName: fullName.trim() });
    const idToken = await credential.user.getIdToken(true);

    // Provision the ServiceFlow tenant. The endpoint is idempotent, so a
    // network failure after a successful commit is safe to retry.
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ fullName: fullName.trim(), companyName: companyName.trim() }),
    });
    if (!response.ok) {
      const body = await readJson(response);
      throw new AuthError("REGISTRATION_FAILED", typeof body?.message === "string" ? body.message : undefined);
    }

    await sendEmailVerification(credential.user, { url: `${window.location.origin}/login` });
    return { success: true, email: credential.user.email };
  } finally {
    // No server session before the email is verified.
    await signOut(auth).catch(() => undefined);
  }
}

export async function loginWithEmail({ email, password }: LoginInput) {
  connectAuthEmulatorIfNeeded();
  // The HttpOnly server session is the source of truth; Firebase client state
  // is discarded as soon as the cookie exists.
  await setPersistence(auth, inMemoryPersistence);

  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  try {
    if (!credential.user.emailVerified) {
      // Resend so the user can act on the message; Firebase rate-limits this.
      await sendEmailVerification(credential.user, { url: `${window.location.origin}/login` }).catch(() => undefined);
      throw new AuthError("EMAIL_NOT_VERIFIED");
    }
    await establishServerSession(credential.user);
    return { success: true };
  } finally {
    await signOut(auth).catch(() => undefined);
  }
}

interface AcceptInvitationInput {
  token: string;
  email: string;
  password: string;
}
interface RegisterForInvitationInput extends AcceptInvitationInput {
  fullName: string;
}

async function acceptWithUser(user: User, token: string): Promise<{ organizationName: string }> {
  const idToken = await user.getIdToken(true);
  const response = await fetch("/api/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ token }),
  });
  const body = await readJson(response);
  if (!response.ok) {
    const code = typeof body?.code === "string" ? body.code : undefined;
    if (code === "EMAIL_MISMATCH") throw new AuthError("INVITATION_EMAIL_MISMATCH");
    if (code === "EXPIRED" || code === "REVOKED" || code === "ACCEPTED" || response.status === 404) throw new AuthError("INVITATION_INVALID");
    if (code === "EMAIL_NOT_VERIFIED") throw new AuthError("EMAIL_NOT_VERIFIED");
    throw new AuthError("INVITATION_FAILED", typeof body?.message === "string" ? body.message : undefined);
  }
  return { organizationName: typeof body?.organizationName === "string" ? body.organizationName : "" };
}

/** Existing account: sign in, accept the invitation, then start the server session. */
export async function acceptInvitationWithPassword({ token, email, password }: AcceptInvitationInput) {
  connectAuthEmulatorIfNeeded();
  await setPersistence(auth, inMemoryPersistence);
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  try {
    if (!credential.user.emailVerified) {
      await sendEmailVerification(credential.user, { url: `${window.location.origin}/invite/${token}` }).catch(() => undefined);
      throw new AuthError("EMAIL_NOT_VERIFIED");
    }
    const result = await acceptWithUser(credential.user, token);
    await establishServerSession(credential.user);
    return result;
  } finally {
    await signOut(auth).catch(() => undefined);
  }
}

/**
 * New account for an invitee: create it and send a verification email whose
 * continue link returns to this invitation. Acceptance happens on the next visit.
 */
export async function registerForInvitation({ token, email, fullName, password }: RegisterForInvitationInput) {
  connectAuthEmulatorIfNeeded();
  await setPersistence(auth, inMemoryPersistence);
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  try {
    await updateProfile(credential.user, { displayName: fullName.trim() });
    await sendEmailVerification(credential.user, { url: `${window.location.origin}/invite/${token}` });
    return { verificationSent: true as const, email: credential.user.email };
  } finally {
    await signOut(auth).catch(() => undefined);
  }
}
