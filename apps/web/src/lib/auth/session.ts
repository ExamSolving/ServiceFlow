import "server-only";

import { cookies } from "next/headers";

import { adminAuth } from "@/src/lib/firebase/admin";

import { SESSION_COOKIE_NAME } from "./constants";

export async function getServerSession() {
  const cookieStore = await cookies();

  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decodedToken = await adminAuth.verifySessionCookie(
      sessionCookie,
      true,
    );

    return decodedToken;
  } catch {
    return null;
  }
}
