/**
 * Public app configuration. Expo inlines EXPO_PUBLIC_* values when the app is
 * built, so they must be read with static `process.env.EXPO_PUBLIC_…` access
 * and must never contain secrets — they ship inside the app.
 */
export const env = {
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  },
  /** Address of the ServiceFlow web app that serves /api/mobile, without a trailing slash. */
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, ''),
  useAuthEmulator: process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true',
  authEmulatorUrl: process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099',
};

/** Required settings that are missing, so the app can explain the problem instead of crashing. */
export function missingSettings(): string[] {
  const required: [string, string][] = [
    ['EXPO_PUBLIC_FIREBASE_API_KEY', env.firebase.apiKey],
    ['EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', env.firebase.authDomain],
    ['EXPO_PUBLIC_FIREBASE_PROJECT_ID', env.firebase.projectId],
    ['EXPO_PUBLIC_FIREBASE_APP_ID', env.firebase.appId],
    ['EXPO_PUBLIC_API_URL', env.apiUrl],
  ];
  return required.filter(([, value]) => !value).map(([name]) => name);
}
