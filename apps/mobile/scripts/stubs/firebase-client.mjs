// Stand-in for src/lib/firebase/client.ts, which needs React Native.
export class AppConfigError extends Error {
  constructor(missing) {
    super(`Missing app settings: ${missing.join(', ')}`);
    this.name = 'AppConfigError';
    this.missing = missing;
  }
}

export function getFirebaseAuth() {
  throw new Error('Firebase Auth is not available in unit tests.');
}
