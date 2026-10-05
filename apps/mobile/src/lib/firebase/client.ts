import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';
import { Platform } from 'react-native';

import { missingSettings } from '@/lib/env';
import { firebaseConfig } from './config';
import { connectAuthEmulatorIfNeeded } from './emulator';

export class AppConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Missing app settings: ${missing.join(', ')}`);
    this.name = 'AppConfigError';
    this.missing = missing;
  }
}

let cachedAuth: Auth | null = null;

/**
 * Firebase Authentication is the only Firebase service in the app. All data
 * comes from the ServiceFlow API, which verifies the user's ID token — the
 * same model as the web admin, where Firestore is never opened to clients.
 */
export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  const missing = missingSettings();
  if (missing.length) throw new AppConfigError(missing);

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  let auth: Auth;
  if (Platform.OS === 'web') {
    auth = getAuth(app);
  } else {
    try {
      // Keep technicians signed in between launches.
      auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
    } catch {
      // Fast Refresh re-runs this module after Auth was already initialised.
      auth = getAuth(app);
    }
  }
  connectAuthEmulatorIfNeeded(auth);
  cachedAuth = auth;
  return auth;
}
