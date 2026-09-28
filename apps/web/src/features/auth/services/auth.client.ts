"use client";

import {
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";

import { auth } from "@/src/lib/firebase/client";
import { connectAuthEmulatorIfNeeded } from "@/src/lib/firebase/emulator";

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

export async function registerOwner({
  fullName,
  companyName,
  email,
  password,
}: RegisterOwnerInput) {
  connectAuthEmulatorIfNeeded();

  await setPersistence(auth, inMemoryPersistence);

  /*
   * Firebase owns the password.
   */
  const credential = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );

  try {
    /*
     * Set Firebase display name
     */
    await updateProfile(credential.user, {
      displayName: fullName.trim(),
    });

    /*
     * Get trusted Firebase identity
     */
    const idToken = await credential.user.getIdToken(true);

    /*
     * Provision ServiceFlow tenant
     */
    const response = await fetch("/api/auth/register", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",

        Authorization: `Bearer ${idToken}`,
      },

      body: JSON.stringify({
        fullName: fullName.trim(),

        companyName: companyName.trim(),
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);

      throw new Error(body?.message ?? "Unable to complete registration.");
    }

    /*
     * Send verification email
     */
    await sendEmailVerification(credential.user);

    /*
     * Do NOT create ServiceFlow
     * server session yet.
     *
     * Email must be verified first.
     */
    await signOut(auth);

    return {
      success: true,
      email: credential.user.email,
    };
  } catch (error) {
    /*
     * Don't blindly delete the Firebase
     * user here.
     *
     * The Firestore request could have
     * committed successfully but the
     * network response could have failed.
     *
     * Registration endpoint is therefore
     * designed to be idempotent.
     */

    throw error;
  }
}

export async function loginWithEmail({ email, password }: LoginInput) {
  connectAuthEmulatorIfNeeded();

  /*
   * We're using an HttpOnly server session,
   * so Firebase client state doesn't need
   * long-term persistence.
   */
  await setPersistence(auth, inMemoryPersistence);

  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );

  if (!credential.user.emailVerified) {
    await signOut(auth);

    throw new Error("EMAIL_NOT_VERIFIED");
  }

  const idToken = await credential.user.getIdToken();

  const response = await fetch("/api/auth/session", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      idToken,
    }),
  });

  if (!response.ok) {
    await signOut(auth);

    throw new Error("Unable to establish session.");
  }

  /*
   * Server cookie is now our web
   * authentication source of truth.
   */
  await signOut(auth);

  return {
    success: true,
  };
}
