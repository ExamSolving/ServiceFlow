"use client";

import {
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { auth } from "@/src/lib/firebase/client";

import { connectAuthEmulatorIfNeeded } from "@/src/lib/firebase/emulator";

interface LoginInput {
  email: string;
  password: string;
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
