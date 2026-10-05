# ServiceFlow — Technician app

The mobile app for field technicians, built with Expo SDK 57, Expo Router and TypeScript. It uses the same
Firebase project and the same colours as the web admin in `apps/web`.

**This release covers sign-in, account checks and the technician's jobs:** the jobs list, job details, status
updates and notes.

## What technicians can do

- Sign in with the same email and password they use for ServiceFlow on the web, and stay signed in.
- Reset a forgotten password and verify their email address.
- See their jobs on the home screen (**My jobs**): the job in hand, today's visits with missed ones first, what's
  coming up by day, jobs without a visit time, jobs waiting on the office, and jobs done in the last 7 days.
- Open a job: visit time, customer (with **Call** while the job is open), service address (with **Directions**),
  work description, notes and status history.
- Move a job along from the phone, from **Accept job** to **Complete job**, decline it with a reason, or put it on
  hold (see *Jobs* below). Add notes the office sees on the web job page.
- See their technician profile, workspace and availability status in **Settings**, and sign out there.
- Get a clear explanation when they can't use the app yet (not a technician, no technician profile,
  inactive profile, suspended membership, and so on).
- Use the app in **English, हिन्दी (Hindi) or తెలుగు (Telugu)**, chosen on first launch before sign-in, with a
  **System, Light or Dark** theme. Both can be changed at any time from the language button at the top of
  the screen.

## How sign-in works

Firebase **Authentication is the only Firebase service on the phone**. The app never reads or writes Firestore
or Storage directly; the deny-all Firestore and Storage rules stay as they are. Everything else comes from the
ServiceFlow API in `apps/web`, which checks every request.

1. The technician signs in with Firebase Authentication (email and password). Firebase keeps the session in
   the app's private storage (AsyncStorage) so the app opens signed in next time — see *Staying signed in and
   working offline* below.
2. The app calls `GET /api/mobile/session` on the web app with `Authorization: Bearer <Firebase ID token>`.
   No cookies are used, so the web app's cookie and CSRF protections are unaffected.
3. The server verifies the token (including revocation), requires a verified email, resolves the workspace
   membership with the same `resolveAppSession` as the web admin, and looks up the technician profile.
4. The answer decides which screen the technician sees:

| Server answer | App shows |
| --- | --- |
| `access: ALLOWED` | Home |
| `access: ROLE_NOT_SUPPORTED` (office roles) | "This app is for technicians" |
| `access: PROFILE_MISSING` | "Your technician profile isn't ready" |
| `access: PROFILE_INACTIVE` | "Your technician profile is inactive" |
| `403 EMAIL_NOT_VERIFIED` | Verify your email |
| `403 ACCOUNT_UNAVAILABLE` + reason | "Your account isn't active" with the reason |
| `401 TOKEN_EXPIRED` | Retries once with a fresh token |
| `401 SESSION_REVOKED` / `UNAUTHENTICATED` | Signs out: "Your session has ended" |

The root layout (`src/app/_layout.tsx`) uses `Stack.Protected` so each state can only reach its own screens.

## Staying signed in and working offline

- **Signed in until they sign out.** Firebase keeps the sign-in on the phone and refreshes its tokens itself.
- **Opens without signal.** After each successful account check the app saves the account summary (name,
  workspace, role, technician status — no tokens) under `serviceflow.session.v1`. On launch it opens straight on
  the home screen from that summary and checks with ServiceFlow in the background.
- **When ServiceFlow can't be reached** the home screen stays, with a banner: *You're offline. Showing your
  details from 9:15.* (or *ServiceFlow can't be reached right now…* for server errors) and **Try again**.
- **Checks again by itself**: on launch, when the app comes back to the front (if offline or the last check is
  over 5 minutes old), every 15 minutes while open, and after 30 s, 1 min, 2 min, then every 5 min while
  offline. Pull down on Home to check now.
- **The server always wins.** If a check says the technician is blocked, inactive, unverified or signed out
  elsewhere, the app follows it at once and deletes the saved summary. Revoked or disabled accounts are signed
  out with *Your session has ended*.
- **Limits.** The saved summary is used offline for up to **7 days** after the last successful check, only for the
  same Firebase user, and only if that check allowed access. Signing out deletes it. Rules live in
  `src/lib/auth/session-sync.ts` (unit tested) and the provider in `src/providers/auth-provider.tsx`.
- **Changes need a connection.** Jobs open from the phone's saved copy without signal (see *Jobs*), but status
  updates and notes are only sent online. A request that drops on the way is retried with the same request ID,
  so it is applied once.

## Jobs

The technician's jobs come from four routes in `apps/web` (`src/app/api/mobile/jobs/`), checked like
`/api/mobile/session` plus: the caller must be a Technician with a linked, active technician profile (otherwise
`403 TECHNICIAN_UNAVAILABLE`, and the app re-checks the account). Every route only sees jobs in the caller's
workspace that are assigned to their technician profile; anything else is `404`.

| Route | What it does |
| --- | --- |
| `GET /api/mobile/jobs` | Open jobs (Assigned through On hold, plus Rescheduled ones the office is changing), up to 100, and jobs completed in the last 7 days |
| `GET /api/mobile/jobs/{id}` | One job: details, customer phone while the job is open, the latest 50 notes, status history and the allowed moves |
| `POST /api/mobile/jobs/{id}/status` | `{ to, version, requestId, reason?, note? }` — a status move; answers `{ job }`, or `{ job: null }` after a decline |
| `POST /api/mobile/jobs/{id}/notes` | `{ body, requestId }` — a note, saved with the job's notes on the web |

**What a technician can set.** The list lives in `packages/domain/src/job-technician-moves.ts`, next to the job state
machine (and is checked against it); the server sends each job's allowed moves, so the app shows only those:

| When the job is | Buttons | Moves it to |
| --- | --- | --- |
| Assigned | Accept job · Decline (reason) | Accepted · Rescheduled |
| Accepted | On my way · Can't make it (reason) | En route · Rescheduled |
| En route | I've arrived | Arrived |
| Arrived | Start diagnosis · Start work | Diagnosing · In progress |
| Diagnosing | Start work · Needs a quote (optional note) · Put on hold (reason) | In progress · Quote needed · On hold |
| Approved | Start work | In progress |
| In progress | Complete job (confirm, optional note) · Put on hold (reason) | Completed · On hold |
| On hold | Resume work | In progress |

Dispatch, quotations (Awaiting approval, Approved), billing statuses, Cancelled and Rejected stay with the office.

- **Decline** and **Can't make it** send the job back to the office as *Rescheduled*, without a technician and with
  the visit time kept; the reason goes in the job's Activity. The dispatcher re-assigns it from the Schedule.
- **One-tap moves wait 4 seconds with Undo** before they are sent, because a saved move can't be reversed. Moves
  that need a reason, a note or a confirmation open a sheet first.
- **Safe retries.** Each move and note carries a `requestId` (a UUID). The server derives the audit entry's or
  note's ID from it, so a repeat answers like the first request and is never applied twice. A stale `version`
  gives `409 CONFLICT`; the app reloads the job and says it changed.
- **Saved on the phone** under `serviceflow.jobs.v1`: the list and each job opened, for the same user, for up to
  7 days, cleared with the saved account check (sign-out, revoked sign-in, blocked account). They refresh after
  every confirmed account check: at launch, when the app comes back to the front, every 15 minutes, and on pull
  to refresh.
- **Office view.** Changes from the phone show in the web job page's Activity with the technician's name, for
  example *Status changed from Accepted to En route by Tess Fernandes in the technician app*.

## Languages and themes

- **First launch.** Before anything else the app shows *Choose your language*, with the phone's language
  pre-selected when it is English, Hindi or Telugu (read with `expo-localization`), plus the theme. Tapping an
  option switches the screen straight away; **Continue** saves the choice. Existing installs see this screen
  once after updating.
- **Saved on the phone** (AsyncStorage, key `serviceflow.preferences.v1`), not on the server, so it works
  before sign-in and survives sign-out. Change it later from the language button in the top bar, which opens
  **Settings**.
- **Theme.** *System* follows the phone's light or dark setting; *Light* and *Dark* override it, including
  native controls such as the keyboard (`Appearance.setColorScheme`). Colours come from `src/constants/theme.ts`.
- **Emails.** The app sets Firebase Auth's `languageCode`, so password-reset and verification emails use
  Firebase's Hindi or Telugu templates where Firebase has them (English otherwise).
- **Server messages.** The app shows its own translated message for every server answer (by `code` and
  `reason`), never the server's English text.

### How translations work

- `src/i18n/messages/en.ts` is the source. `hi.ts` and `te.ts` are typed against it, so TypeScript reports a
  missing or extra key, and `t()` reports a missing or misspelt `{{placeholder}}`:
  `t('home.signedInTo', { organization })`.
- Screens call `useTranslation()` (or `usePreferences()`) from `src/providers/preferences-provider.tsx`.
- Keep brand names, file paths and the web admin's English section names (for example *Technicians*) as they
  are. Telugu loanwords such as పాస్‌వర్డ్ contain a zero-width non-joiner; copy existing words rather than
  retyping them.
- `npm test` checks that every language has every message with the same placeholders.
- **To add a language:** add it to `LANGUAGES` and `Language` in `src/i18n/languages.ts`, create
  `src/i18n/messages/<code>.ts` typed as `Messages`, and register it in `MESSAGES` in `src/i18n/translate.ts`.
- The Hindi and Telugu text was written for this release. Ask a native speaker on your team to review it
  before going live.

## Getting a technician into the app

1. An owner or admin invites them from **Team** with the **Technician** role.
2. They open the invitation on the web, create their account (or sign in) and verify their email.
3. A manager adds their technician profile: **Technicians → Add technician → choose the team member**.
4. They sign in on the app with the same email and password.

## Setup

1. **Install dependencies** from the repository root (this repo is an npm workspace):

   ```bash
   npm install
   ```

2. **Configure the app.** Copy `.env.example` to `.env.local` and fill it in. The Firebase values are the same
   as `NEXT_PUBLIC_FIREBASE_*` in `apps/web/.env.local`. If `.env.local` already exists, check
   `EXPO_PUBLIC_API_URL` for the device you test on:

   | Testing on | `EXPO_PUBLIC_API_URL` |
   | --- | --- |
   | iOS simulator | `http://localhost:3000` |
   | Android emulator | `http://10.0.2.2:3000` |
   | A phone on the same Wi-Fi | `http://<your computer's Wi-Fi IP>:3000` |
   | Production | `https://<your ServiceFlow domain>` |

   `EXPO_PUBLIC_*` values are built into the app. **Never put secrets in them** (service-account keys,
   `GOOGLE_APPLICATION_CREDENTIALS`, admin credentials).

3. **Start the web app** (it serves the API): `npm run web` from the repository root. The jobs screens need the
   web app's `/api/mobile/jobs` routes and one Firestore index (jobs by `organizationId`, `assignedTechnicianId`,
   `completedAt`): deploy it with `firebase deploy --only firestore:indexes`.

4. **Start the app:** `npm run mobile` from the repository root (or `npx expo start` here), then open it in
   Expo Go or a development build. Restart Expo after changing `.env.local`.

### Using the Firebase emulators

Set `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true` (match `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` in the web app) and
point `EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_URL` at the Auth emulator: `http://127.0.0.1:9099` on the iOS
simulator, `http://10.0.2.2:9099` on the Android emulator, or your computer's Wi-Fi IP from a phone (start the
emulators with `"host": "0.0.0.0"` for that). Run the web app with `FIREBASE_AUTH_EMULATOR_HOST` set so the
server accepts emulator tokens.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run ios` / `npm run android` | Start and open a simulator or emulator |
| `npm run lint` | `expo lint` (ESLint with `eslint-config-expo`, including React Compiler rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (no install needed): the session contract and API errors, every translation complete with the same placeholders, language detection, saved preferences and themes, the offline session rules, and the jobs logic (response checks, API calls, saved jobs, grouping, button wording, request IDs) |

## Project structure

```
src/
  app/                    Routes (Expo Router)
    _layout.tsx           Providers, theme, splash screen and the language and sign-in gate
    welcome.tsx           First launch: choose language and theme
    settings.tsx          Language and theme (before or after sign-in); account and Sign out when signed in
    sign-in.tsx           Email and password sign-in
    forgot-password.tsx   Password reset email
    verify-email.tsx      Email verification with resend cooldown
    account-status.tsx    Why the app isn't available, with Try again / Sign out
    (app)/index.tsx       My jobs (home)
    (app)/jobs/[id].tsx   A job, with its status moves, notes and history
    (app)/jobs/done.tsx   Jobs done in the last 7 days
  providers/auth-provider.tsx   Firebase auth state + ServiceFlow session check
  providers/jobs-provider.tsx   The technician's jobs: fetch, save on the phone, moves and notes
  providers/preferences-provider.tsx   Language, theme, translations (saved on the phone)
  i18n/                   Languages and the English, Hindi and Telugu messages
  lib/firebase/           Auth-only Firebase client, persistence and emulator
  lib/api/client.ts       API calls with the Bearer token and a 15-second timeout
  lib/auth/               Session types and parser, offline session rules and saved summary,
                          error message keys, label keys
  lib/jobs/               Job types and response checks, API calls, saved-jobs rules, list grouping,
                          button wording, request IDs
  lib/preferences.ts      Reading, saving and resolving language and theme
  components/             UI kit (button, text field, card, notice, sheet, status chip, icons, top bar,
                          language and theme pickers, offline banner)
  components/jobs/        Job rows and groups, status and priority chips, move sheets
  hooks/use-now.ts        The current time, refreshed every minute
  constants/theme.ts      Palette: light = web admin tokens, dark = matching green tints
  types/                  Type declarations (Firebase React Native persistence)
scripts/                  Unit tests (`npm test`) with small stand-ins for native modules
example/                  The original Expo starter, kept out of the build (git-ignored)
```

## Not in this release yet

Photos and customer signatures, push notifications for new or changed jobs, sending changes made offline,
quotations and invoices from the phone, technicians changing their own availability, and ServiceFlow app icons
and splash artwork (the Expo defaults are still in `assets/`).
