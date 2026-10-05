import {
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { authErrorCode } from '@/lib/auth/auth-errors';
import { fetchMobileSession, type MobileSession } from '@/lib/auth/mobile-session';
import { clearCachedSession, loadCachedSession, saveCachedSession } from '@/lib/auth/session-store';
import {
  RECHECK_EVERY_MS,
  classifyCheckError,
  isCheckDue,
  isSignInEnded,
  retryDelay,
  type CachedSession,
  type ErrorReason,
} from '@/lib/auth/session-sync';
import { missingSettings } from '@/lib/env';
import { clearSavedJobs } from '@/lib/jobs/store';
import { getFirebaseAuth } from '@/lib/firebase/client';

export type { ErrorReason } from '@/lib/auth/session-sync';
export type BlockedReason = 'ROLE_NOT_SUPPORTED' | 'PROFILE_MISSING' | 'PROFILE_INACTIVE' | 'ACCOUNT_UNAVAILABLE';
export type Notice = 'sessionEnded';

/** How current the account details on screen are. */
export interface SessionSync {
  /** When ServiceFlow last confirmed the account. */
  checkedAt: number;
  /** "offline" or "unavailable" while saved details are shown because the latest check failed. */
  connection: 'online' | 'offline' | 'unavailable';
  /** A check is running in the background. */
  checking: boolean;
}

/**
 * Where the technician is in the sign-in journey. The root layout shows
 * exactly one group of screens for each status.
 */
export type AuthState =
  | { status: 'loading' }
  | { status: 'misconfigured'; missing: string[] }
  | { status: 'signedOut' }
  | { status: 'unverified'; email: string }
  | { status: 'blocked'; reason: BlockedReason; email: string; session: MobileSession | null; detail: string | null }
  | { status: 'error'; email: string; reason: ErrorReason }
  | { status: 'ready'; session: MobileSession; sync: SessionSync };

interface AuthContextValue {
  state: AuthState;
  /** A one-off message for the sign-in screen, such as why the session ended. */
  notice: Notice | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Check the account again (pull to refresh, Try again, after verifying email). Resolves to the new state, or null if superseded. */
  refresh(): Promise<AuthState | null>;
  resendVerification(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function initialState(): AuthState {
  const missing = missingSettings();
  return missing.length ? { status: 'misconfigured', missing } : { status: 'loading' };
}

/**
 * Firebase keeps the sign-in on the phone. On top of that, the last
 * successful account check is saved, so the app opens straight to the home
 * screen — even with no signal — and checks again in the background: on
 * launch, when the app comes back to the front, every 15 minutes while open,
 * and with increasing waits while ServiceFlow can't be reached.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Each check gets a number; only the latest one may update the state.
  const latestRun = useRef(0);
  // The last confirmed account for the signed-in user, shown while ServiceFlow can't be reached.
  const known = useRef<CachedSession | null>(null);
  // Failed checks in a row, for the retry waits.
  const failures = useRef(0);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /** Drop everything remembered about the account on this phone: the saved check and the saved jobs. */
  const forget = useCallback(() => {
    known.current = null;
    failures.current = 0;
    void clearCachedSession();
    void clearSavedJobs();
  }, []);

  const endSession = useCallback(
    async (reason: Notice) => {
      forget();
      setNotice(reason);
      try {
        await firebaseSignOut(getFirebaseAuth());
      } catch {
        // Already signed out.
      }
    },
    [forget],
  );

  /**
   * Ask ServiceFlow about the account. In the background the current screen
   * stays; otherwise the sign-in screen shows progress.
   */
  const verify = useCallback(
    async (user: User, options: { background: boolean; forceRefresh?: boolean }): Promise<AuthState | null> => {
      const run = ++latestRun.current;
      const settle = (next: AuthState) => {
        if (run !== latestRun.current) return null;
        setState(next);
        return next;
      };
      const email = user.email ?? '';
      if (!options.background) setState({ status: 'loading' });
      else setState((current) => (current.status === 'ready' ? { ...current, sync: { ...current.sync, checking: true } } : current));

      try {
        const session = await fetchMobileSession(user, options.forceRefresh);
        if (run !== latestRun.current) return null;
        if (session.access !== 'ALLOWED') {
          forget();
          return settle({ status: 'blocked', reason: session.access, email, session, detail: null });
        }
        const entry: CachedSession = { uid: user.uid, checkedAt: Date.now(), session };
        known.current = entry;
        failures.current = 0;
        void saveCachedSession(entry);
        return settle({ status: 'ready', session, sync: { checkedAt: entry.checkedAt, connection: 'online', checking: false } });
      } catch (error) {
        if (run !== latestRun.current) return null;
        const failure = classifyCheckError(error);
        switch (failure.kind) {
          case 'ended':
            await endSession('sessionEnded');
            return null;
          case 'unverified':
            forget();
            return settle({ status: 'unverified', email });
          case 'unavailable':
            forget();
            return settle({ status: 'blocked', reason: 'ACCOUNT_UNAVAILABLE', email, session: null, detail: failure.reason });
          case 'transient': {
            const saved = known.current?.uid === user.uid ? known.current : null;
            if (!saved) return settle({ status: 'error', email, reason: failure.reason });
            failures.current += 1;
            return settle({
              status: 'ready',
              session: saved.session,
              sync: { checkedAt: saved.checkedAt, connection: failure.reason === 'network' ? 'offline' : 'unavailable', checking: false },
            });
          }
        }
      }
    },
    [endSession, forget],
  );

  /** Firebase reported a sign-in or sign-out (including the saved sign-in at launch). */
  const handleUser = useCallback(
    async (user: User | null): Promise<AuthState | null> => {
      if (!user || !user.emailVerified) {
        ++latestRun.current;
        forget();
        const next: AuthState = user ? { status: 'unverified', email: user.email ?? '' } : { status: 'signedOut' };
        setState(next);
        return next;
      }
      if (known.current?.uid !== user.uid) {
        const run = ++latestRun.current;
        const cached = await loadCachedSession(user.uid);
        if (run !== latestRun.current) return null;
        if (cached) {
          // Open on the saved details straight away, then confirm them.
          known.current = cached;
          setState({ status: 'ready', session: cached.session, sync: { checkedAt: cached.checkedAt, connection: 'online', checking: true } });
          return verify(user, { background: true });
        }
      }
      return verify(user, { background: known.current?.uid === user.uid });
    },
    [forget, verify],
  );

  const misconfigured = state.status === 'misconfigured';
  useEffect(() => {
    if (misconfigured) return;
    try {
      // Firebase restores a saved sign-in first (even offline), then reports every sign-in and sign-out.
      return onAuthStateChanged(getFirebaseAuth(), (user) => {
        void handleUser(user);
      });
    } catch (error) {
      console.error('[auth] Firebase Auth could not start', error);
      void Promise.resolve().then(() => setState({ status: 'error', email: '', reason: 'startup' }));
    }
  }, [misconfigured, handleUser]);

  // Check again later: every 15 minutes while all is well, sooner while ServiceFlow can't be reached.
  useEffect(() => {
    if (state.status !== 'ready' || state.sync.checking) return;
    const delay = state.sync.connection === 'online' ? RECHECK_EVERY_MS : retryDelay(failures.current - 1);
    const timer = setTimeout(() => {
      const user = getFirebaseAuth().currentUser;
      if (user) void verify(user, { background: true });
    }, delay);
    return () => clearTimeout(timer);
  }, [state, verify]);

  // Check again when the app comes back to the front, if the details may be out of date.
  useEffect(() => {
    if (misconfigured) return;
    const subscription = AppState.addEventListener('change', (next) => {
      const current = stateRef.current;
      if (next !== 'active' || current.status !== 'ready' || current.sync.checking || !isCheckDue(current.sync, Date.now())) return;
      const user = getFirebaseAuth().currentUser;
      if (user) void verify(user, { background: true });
    });
    return () => subscription.remove();
  }, [misconfigured, verify]);

  const signIn = useCallback(async (email: string, password: string) => {
    setNotice(null);
    await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  }, []);

  const signOut = useCallback(async () => {
    setNotice(null);
    forget();
    try {
      await firebaseSignOut(getFirebaseAuth());
    } catch {
      // Already signed out.
    }
  }, [forget]);

  const refresh = useCallback(async (): Promise<AuthState | null> => {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) return handleUser(null);
    try {
      // Picks up a newly verified email or a disabled account.
      await reload(user);
    } catch (error) {
      if (isSignInEnded(error)) {
        await endSession('sessionEnded');
        return null;
      }
      // Connection problems are reported by the check below.
    }
    const current = auth.currentUser;
    if (!current || !current.emailVerified) return handleUser(current);
    return verify(current, { background: true, forceRefresh: true });
  }, [endSession, handleUser, verify]);

  const resendVerification = useCallback(async () => {
    const user = getFirebaseAuth().currentUser;
    if (!user) throw new Error('Sign in to continue.');
    await sendEmailVerification(user);
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
    } catch (error) {
      // Never reveal whether an account exists for this address.
      if (authErrorCode(error) === 'auth/user-not-found') return;
      throw error;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, notice, signIn, signOut, refresh, resendVerification, sendPasswordReset }),
    [state, notice, signIn, signOut, refresh, resendVerification, sendPasswordReset],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
