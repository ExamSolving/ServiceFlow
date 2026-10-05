import AsyncStorage from '@react-native-async-storage/async-storage';

import { SESSION_CACHE_KEY, readCachedSession, serializeCachedSession, type CachedSession } from './session-sync';

/**
 * The last successful account check, kept on the phone so the app opens
 * without a connection. It holds only what the home screen shows (name,
 * workspace, role, status) — never tokens, which Firebase keeps itself.
 */
export async function loadCachedSession(uid: string): Promise<CachedSession | null> {
  try {
    return readCachedSession(await AsyncStorage.getItem(SESSION_CACHE_KEY), uid, Date.now());
  } catch {
    return null;
  }
}

export async function saveCachedSession(entry: CachedSession): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_CACHE_KEY, serializeCachedSession(entry));
  } catch {
    // Not saved: the next launch checks with ServiceFlow first.
  }
}

export async function clearCachedSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // Nothing to clear.
  }
}
