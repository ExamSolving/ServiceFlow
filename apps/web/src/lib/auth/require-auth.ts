import "server-only";

import { redirect } from "next/navigation";

import { getAppSessionState } from "./app-session";

export const ACCOUNT_UNAVAILABLE_LOGIN_PATH = "/login?reason=account";

/**
 * Page guard. Anonymous visitors go to the login page; a signed-in Firebase
 * user whose ServiceFlow account cannot be resolved is sent to the login page
 * with an explanation instead of looping between /login and /dashboard.
 */
export async function requireAuth() {
  const state = await getAppSessionState();
  if (state.kind === "active") return state.session;
  redirect(state.kind === "unavailable" ? ACCOUNT_UNAVAILABLE_LOGIN_PATH : "/login");
}
