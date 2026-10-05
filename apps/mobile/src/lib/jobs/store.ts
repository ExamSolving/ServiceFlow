import AsyncStorage from '@react-native-async-storage/async-storage';

import { JOBS_CACHE_KEY, readSavedJobs, serializeSavedJobs, type SavedJobs } from './cache';

/**
 * The technician's jobs saved on the phone, so they open without signal.
 * Cleared with the saved account check: on sign-out, a revoked sign-in or a
 * blocked account.
 */
export async function loadSavedJobs(uid: string): Promise<SavedJobs | null> {
  try {
    return readSavedJobs(await AsyncStorage.getItem(JOBS_CACHE_KEY), uid, Date.now());
  } catch {
    return null;
  }
}

export async function storeSavedJobs(saved: SavedJobs): Promise<void> {
  try {
    await AsyncStorage.setItem(JOBS_CACHE_KEY, serializeSavedJobs(saved));
  } catch {
    // Not saved: the jobs load from ServiceFlow next time.
  }
}

export async function clearSavedJobs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(JOBS_CACHE_KEY);
  } catch {
    // Nothing to clear.
  }
}
