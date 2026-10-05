import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getFirebaseAuth } from '@/lib/firebase/client';
import { classifyJobError, fetchJob, fetchJobList, sendMove, sendNote, type JobFailure } from '@/lib/jobs/api';
import { emptySavedJobs, withDetail, withList, withoutJob, type SavedJobs } from '@/lib/jobs/cache';
import { loadSavedJobs, storeSavedJobs } from '@/lib/jobs/store';
import type { JobDetail, JobList, JobNote, JobSummary, MoveRequest } from '@/lib/jobs/types';
import { useAuth } from '@/providers/auth-provider';

/** A jobs request that failed, with what it means for the screen. */
export class JobRequestError extends Error {
  readonly failure: JobFailure;

  constructor(failure: JobFailure) {
    super(`Job request failed: ${failure}`);
    this.name = 'JobRequestError';
    this.failure = failure;
  }
}

export const failureOf = (error: unknown): JobFailure => (error instanceof JobRequestError ? error.failure : 'server');

interface JobsContextValue {
  /** False until the jobs saved on the phone have been read. */
  loaded: boolean;
  /** The list on screen: fetched, or the saved copy. */
  list: JobList | null;
  /** When that list came from ServiceFlow. */
  listSavedAt: number | null;
  /** Why the last list fetch failed, if it did. */
  listError: JobFailure | null;
  refreshing: boolean;
  /** Pull to refresh: check the account, then fetch the jobs. */
  refresh(): Promise<void>;
  /** A job from the list, for showing something straight away. */
  summaryOf(id: string): JobSummary | null;
  /** A job as last fetched, if saved. */
  savedJob(id: string): { job: JobDetail; savedAt: number } | null;
  /** Fetch a job. Fails with a JobRequestError. */
  loadJob(id: string): Promise<JobDetail>;
  /** Send a status move, retrying a dropped connection with the same request ID. Resolves to null after a decline. */
  move(id: string, request: MoveRequest): Promise<JobDetail | null>;
  addNote(id: string, body: string, requestId: string): Promise<JobNote>;
}

const JobsContext = createContext<JobsContextValue | null>(null);

/** Waits before retrying a request that hit a dropped connection. */
const RETRY_WAITS_MS = [2000, 5000];
/** A list fetch this recent covers the next trigger too. */
const LIST_FETCH_DEDUPE_MS = 3000;
/** A refused jobs request re-checks the account at most this often, so the two checks can't loop. */
const ACCOUNT_RECHECK_GAP_MS = 60_000;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The signed-in technician's jobs. They are fetched after every confirmed
 * account check (at launch, when the app comes back to the front, every 15
 * minutes and on pull to refresh), saved on the phone, and shown from the
 * saved copy while ServiceFlow can't be reached. Changing a job needs a
 * connection.
 */
export function JobsProvider({ children }: { children: ReactNode }) {
  const { state, refresh: refreshAccount } = useAuth();
  const uid = state.status === 'ready' ? state.session.user.uid : null;
  const checkedAt = state.status === 'ready' ? state.sync.checkedAt : 0;
  const online = state.status === 'ready' && state.sync.connection === 'online' && !state.sync.checking;

  const [saved, setSaved] = useState<SavedJobs | null>(null);
  const [listError, setListError] = useState<JobFailure | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const savedRef = useRef<SavedJobs | null>(null);
  const listFlight = useRef<Promise<void> | null>(null);
  const lastListFetch = useRef(0);
  const lastAccountRecheck = useRef(0);

  /** Ask the auth provider to check the account again, unless a refused request just did. */
  const recheckAccount = useCallback(() => {
    if (Date.now() - lastAccountRecheck.current < ACCOUNT_RECHECK_GAP_MS) return;
    lastAccountRecheck.current = Date.now();
    void refreshAccount();
  }, [refreshAccount]);

  /** Change the saved jobs, show the result and keep it on the phone. */
  const change = useCallback(
    (update: (current: SavedJobs) => SavedJobs) => {
      const current = savedRef.current?.uid === uid ? savedRef.current : uid ? emptySavedJobs(uid) : null;
      if (!current) return;
      const next = update(current);
      savedRef.current = next;
      setSaved(next);
      void storeSavedJobs(next);
    },
    [uid],
  );

  useEffect(() => {
    if (!uid) return;
    let active = true;
    void loadSavedJobs(uid).then((loaded) => {
      if (!active || savedRef.current?.uid === uid) return;
      const initial = loaded ?? emptySavedJobs(uid);
      savedRef.current = initial;
      setSaved(initial);
    });
    return () => {
      active = false;
    };
  }, [uid]);

  const fetchList = useCallback((): Promise<void> => {
    if (listFlight.current) return listFlight.current;
    const user = getFirebaseAuth().currentUser;
    if (!user || !uid) return Promise.resolve();
    lastListFetch.current = Date.now();
    const run = (async () => {
      try {
        const list = await fetchJobList(user);
        change((current) => withList(current, list, Date.now()));
        setListError(null);
      } catch (error) {
        const failure = classifyJobError(error);
        setListError(failure);
        if (failure === 'account') recheckAccount();
      } finally {
        listFlight.current = null;
      }
    })();
    listFlight.current = run;
    return run;
  }, [change, recheckAccount, uid]);

  // After each confirmed account check, fetch the jobs too.
  const loaded = saved !== null && saved.uid === uid;
  useEffect(() => {
    if (!loaded || !online || Date.now() - lastListFetch.current < LIST_FETCH_DEDUPE_MS) return;
    void fetchList();
  }, [loaded, online, checkedAt, fetchList]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await refreshAccount();
      if (next?.status === 'ready' && next.sync.connection === 'online') await fetchList();
    } finally {
      setRefreshing(false);
    }
  }, [fetchList, refreshAccount]);

  /** Run a change, retrying a dropped connection; the request ID inside makes repeats safe. */
  const send = useCallback(
    async <T,>(id: string, request: () => Promise<T>): Promise<T> => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await request();
        } catch (error) {
          const failure = classifyJobError(error);
          if (failure === 'offline' && attempt < RETRY_WAITS_MS.length) {
            await wait(RETRY_WAITS_MS[attempt]);
            continue;
          }
          if (failure === 'gone') change((current) => withoutJob(current, id));
          // Re-check the account: it shows the offline banner, or ends a revoked session.
          if (failure === 'account' || failure === 'offline') recheckAccount();
          throw new JobRequestError(failure);
        }
      }
    },
    [change, recheckAccount],
  );

  const loadJob = useCallback(
    async (id: string) => {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new JobRequestError('account');
      try {
        const job = await fetchJob(user, id);
        change((current) => withDetail(current, job, Date.now()));
        return job;
      } catch (error) {
        const failure = classifyJobError(error);
        if (failure === 'gone') change((current) => withoutJob(current, id));
        if (failure === 'account') recheckAccount();
        throw new JobRequestError(failure);
      }
    },
    [change, recheckAccount],
  );

  const move = useCallback(
    async (id: string, request: MoveRequest) => {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new JobRequestError('account');
      const job = await send(id, () => sendMove(user, id, request));
      change((current) => (job ? withDetail(current, job, Date.now()) : withoutJob(current, id)));
      return job;
    },
    [change, send],
  );

  const addNote = useCallback(
    async (id: string, body: string, requestId: string) => {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new JobRequestError('account');
      const note = await send(id, () => sendNote(user, id, { body, requestId }));
      change((current) => {
        const entry = current.details[id];
        if (!entry) return current;
        const notes = [note, ...entry.value.notes.filter((item) => item.id !== note.id)];
        return withDetail(current, { ...entry.value, notes }, entry.savedAt);
      });
      return note;
    },
    [change, send],
  );

  const value = useMemo<JobsContextValue>(() => {
    const current = saved?.uid === uid ? saved : null;
    return {
      loaded,
      list: current?.list?.value ?? null,
      listSavedAt: current?.list?.savedAt ?? null,
      listError,
      refreshing,
      refresh,
      summaryOf: (id) => current?.list?.value.open.find((job) => job.id === id) ?? current?.list?.value.done.find((job) => job.id === id) ?? null,
      savedJob: (id) => {
        const entry = current?.details[id];
        return entry ? { job: entry.value, savedAt: entry.savedAt } : null;
      },
      loadJob,
      move,
      addNote,
    };
  }, [saved, uid, loaded, listError, refreshing, refresh, loadJob, move, addNote]);

  return <JobsContext value={value}>{children}</JobsContext>;
}

export function useJobs(): JobsContextValue {
  const context = use(JobsContext);
  if (!context) throw new Error('useJobs must be used inside <JobsProvider>.');
  return context;
}
