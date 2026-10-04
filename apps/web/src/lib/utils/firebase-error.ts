import { FirebaseError } from "firebase/app";

import { isAuthError } from "@/src/features/auth/services/auth-error";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  EMAIL_NOT_VERIFIED:
    "Verify your email before signing in. We’ve sent you a fresh verification link — check your inbox and spam folder.",
  ACCOUNT_UNAVAILABLE:
    "Your account isn’t active in a ServiceFlow workspace yet. Ask your workspace owner for an invitation, or sign in with a different account.",
  RECENT_LOGIN_REQUIRED: "Your sign-in took too long to complete. Please sign in again.",
  SESSION_FAILED: "We couldn’t start your session. Please try again.",
  REGISTRATION_FAILED: "Unable to complete registration. Please try again.",
  INVITATION_INVALID: "This invitation link is invalid, expired or already used. Ask your workspace owner for a new one.",
  INVITATION_EMAIL_MISMATCH: "This invitation was sent to a different email address. Sign in with the invited email to accept it.",
  INVITATION_FAILED: "We couldn’t accept this invitation. Please try again.",
};

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/wrong-password": "Email or password is incorrect.",
  "auth/user-not-found": "Email or password is incorrect.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many attempts. Please try again later.",
  "auth/network-request-failed": "Unable to connect. Check your internet connection.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
  "auth/weak-password": "Choose a stronger password with at least 8 characters.",
  "auth/requires-recent-login": "Please sign in again to continue.",
};

/** Map any authentication failure (app or Firebase) to a message users can act on. */
export function getAuthErrorMessage(error: unknown): string {
  if (isAuthError(error)) {
    return error.code === "REGISTRATION_FAILED" && error.message !== error.code
      ? error.message
      : AUTH_ERROR_MESSAGES[error.code] ?? "Something went wrong. Please try again.";
  }
  if (error instanceof FirebaseError) {
    return FIREBASE_ERROR_MESSAGES[error.code] ?? "Unable to complete the request. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

/** @deprecated Use getAuthErrorMessage. Kept for existing imports. */
export const getFirebaseAuthError = getAuthErrorMessage;
