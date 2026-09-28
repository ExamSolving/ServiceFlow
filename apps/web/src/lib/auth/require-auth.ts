import "server-only";

import { redirect } from "next/navigation";

import { getServerSession } from "./session";

export async function requireAuth() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}
