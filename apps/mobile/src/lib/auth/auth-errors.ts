import type { MessageKey } from '@/i18n';
import { AppConfigError } from '@/lib/firebase/client';

/** Firebase error codes → messages (same wording as apps/web/src/lib/utils/firebase-error.ts in English). */
const FIREBASE_AUTH_MESSAGES = {
  'auth/invalid-credential': 'errors.invalidCredential',
  'auth/invalid-login-credentials': 'errors.invalidCredential',
  'auth/wrong-password': 'errors.invalidCredential',
  'auth/user-not-found': 'errors.invalidCredential',
  'auth/invalid-email': 'validation.emailInvalid',
  'auth/missing-email': 'validation.emailRequired',
  'auth/missing-password': 'validation.passwordRequired',
  'auth/user-disabled': 'errors.userDisabled',
  'auth/too-many-requests': 'errors.tooManyRequests',
  'auth/network-request-failed': 'errors.network',
  'auth/user-token-expired': 'errors.tokenExpired',
  'auth/requires-recent-login': 'errors.recentLogin',
  'auth/operation-not-allowed': 'errors.notAllowed',
  'auth/invalid-api-key': 'errors.invalidApiKey',
} as const satisfies Record<string, MessageKey>;

/** A message for a sign-in or account error. None of them need placeholders. */
export type AuthErrorKey =
  | (typeof FIREBASE_AUTH_MESSAGES)[keyof typeof FIREBASE_AUTH_MESSAGES]
  | 'errors.config'
  | 'errors.unknownAuth'
  | 'errors.generic';

/** The Firebase error code (for example "auth/too-many-requests"), if the error has one. */
export function authErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

/** The message to show for any sign-in or account error, as a translation key. */
export function authErrorKey(error: unknown): AuthErrorKey {
  if (error instanceof AppConfigError) return 'errors.config';
  const code = authErrorCode(error);
  if (!code?.startsWith('auth/')) return 'errors.generic';
  return Object.prototype.hasOwnProperty.call(FIREBASE_AUTH_MESSAGES, code)
    ? FIREBASE_AUTH_MESSAGES[code as keyof typeof FIREBASE_AUTH_MESSAGES]
    : 'errors.unknownAuth';
}
