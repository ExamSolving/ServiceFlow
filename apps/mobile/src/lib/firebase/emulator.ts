import { connectAuthEmulator, type Auth } from 'firebase/auth';

import { env } from '@/lib/env';

const connected = new WeakSet<Auth>();

/**
 * Point Auth at the local emulator when EXPO_PUBLIC_USE_FIREBASE_EMULATOR is
 * "true". From an Android emulator use http://10.0.2.2:9099; from a phone use
 * your computer's network address (see README).
 */
export function connectAuthEmulatorIfNeeded(auth: Auth) {
  if (!env.useAuthEmulator || connected.has(auth)) return;
  try {
    connectAuthEmulator(auth, env.authEmulatorUrl, { disableWarnings: true });
  } catch {
    // Already connected after a Fast Refresh.
  }
  connected.add(auth);
}
