export type AuthErrorCode =
  | "EMAIL_NOT_VERIFIED"
  | "ACCOUNT_UNAVAILABLE"
  | "RECENT_LOGIN_REQUIRED"
  | "SESSION_FAILED"
  | "REGISTRATION_FAILED"
  | "INVITATION_INVALID"
  | "INVITATION_EMAIL_MISMATCH"
  | "INVITATION_FAILED";

/** Application-level authentication failure with a stable code for the UI. */
export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AuthError";
    this.code = code;
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
