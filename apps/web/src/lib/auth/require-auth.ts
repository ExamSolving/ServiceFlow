import "server-only";

import { redirect } from "next/navigation";

import { getAppSession } from "./app-session";

export async function requireAuth() {
  const session = await getAppSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}
