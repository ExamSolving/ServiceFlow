import "server-only";

import { cookies } from "next/headers";

import { adminAuth } from "@/src/lib/firebase/admin";

import { SESSION_COOKIE_NAME } from "./constants";

export async function getFirebaseSession() {
  const cookieStore = await cookies();

  const cookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!cookie) {
    return null;
  }

  try {
    return await adminAuth.verifySessionCookie(cookie, true);
  } catch {
    return null;
  }
}
