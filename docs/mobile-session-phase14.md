# Technician app: persistent, offline-ready session — phase 14

## Scope

Mobile app only. The sign-in already persisted (Firebase Auth with AsyncStorage persistence). This phase makes
the *account check* persistent too, so the app opens straight to the home screen without signal and keeps
working when ServiceFlow is unreachable, while the server stays the authority.

## How it works

- **Saved summary** (`src/lib/auth/session-store.ts`): after every successful `GET /api/mobile/session` that
  returns `ALLOWED`, the app saves `{ uid, checkedAt, session }` under `serviceflow.session.v1`. It contains only
  what the home screen shows — never ID or refresh tokens (Firebase keeps those itself).
- **Rules** (`src/lib/auth/session-sync.ts`, pure and unit tested): a saved summary is used only for the same
  Firebase user, only if it allowed access, for at most 7 days (`OFFLINE_SESSION_MAX_AGE_MS`), and never if it is
  dated more than 5 minutes in the future. `classifyCheckError` sorts failed checks into *ended* (401, revoked or
  disabled Firebase user → sign out), *unverified*, *unavailable* (`ACCOUNT_UNAVAILABLE` + reason) and
  *transient* (network, server, unexpected response).
- **Provider** (`src/providers/auth-provider.tsx`): on Firebase's saved sign-in at launch, the app shows the
  saved summary immediately (`status: 'ready'`, `sync.checking: true`) and verifies in the background.
  Transient failures keep the ready state with `sync.connection: 'offline' | 'unavailable'`; anything else from
  the server replaces it at once and deletes the summary. Without a saved summary, failures show the account
  status screen as before.
- **Re-checks**: when the app returns to the foreground (`AppState`) if offline or the last check is over
  5 minutes old; every 15 minutes while open; 30 s, 1 min, 2 min, then every 5 min while offline; pull to refresh
  and **Try again** force a fresh token.
- **UI**: `src/components/sync-banner.tsx` on Home — *You're offline. Showing your details from {{time}}.* or
  *ServiceFlow can't be reached right now…*, with **Try again** — in English, Hindi and Telugu, the time in the
  workspace time zone (`formatCheckedAt`).
- **Clearing**: sign-out, revocation, blocked/unverified results, and a different user signing in all drop the
  saved summary.

## Files

Created: `src/lib/auth/session-sync.ts`, `src/lib/auth/session-store.ts`, `src/components/sync-banner.tsx`,
`scripts/test-session.mjs`. Changed: `src/providers/auth-provider.tsx`, `src/app/(app)/index.tsx`,
`src/lib/format.ts` (`formatCheckedAt`), `src/i18n/messages/{en,hi,te}.ts` (`home.offline`,
`home.unreachable`), `package.json` (`npm test` runs three suites; also carries your `@expo/ui` ~57.0.21 and
`expo-router` ~57.0.24 updates), `package-lock.json`.

## Security notes

Offline access shows only the technician's own saved summary; it grants no access to data, which still needs the
server. A revoked or disabled account can keep seeing that summary on a phone that stays offline, for at most
7 days; the first successful check signs it out. Shared phones: signing out deletes the summary.

## Test checklist

`npm test` (auth 8/8, languages 9/9, offline session 10/10), `npm run typecheck`, `npm run lint`,
`npx expo export --platform android --platform ios`. Browser run of the web build with ServiceFlow and Firebase
cut off and restored: 12 offline steps (opens Home offline with the banner; Try again offline and online; re-check
on returning to the app; automatic retry after 30 s; a server-side change wins and clears the summary; no stale
Home offline afterwards; the 7-day limit; revocation still signs out; sign-out clears; the next user never sees
the previous one; Telugu banner), plus the 16 English sign-in steps and 13 language steps.

Still to check on real phones: airplane mode at launch, and switching apps while offline.
