# Technician mobile app: Firebase Auth — phase 12

## Scope

Version 1 of the technician app (`apps/mobile`): Firebase Authentication only, plus the server endpoint that
tells the app who the technician is. Screens: sign in, forgot password, verify email, account status and a
home screen with the technician's profile. Jobs, status updates, notes and photos are the next phases.

## Architecture and security

- **Auth only on the device.** `src/lib/firebase/client.ts` initialises Firebase Auth with
  `initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })` (plain `getAuth` on web), and
  connects to the Auth emulator when `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true`. Firestore and Storage are never
  imported; the exported bundles contain only `@firebase/auth`'s React Native build. Client rules stay deny-all.
- **Bearer tokens, not cookies.** `GET /api/mobile/session` (`apps/web/src/app/api/mobile/session/route.ts`)
  reads `Authorization: Bearer <ID token>` through `lib/http/mobile-session.ts`: strict JWT-shaped header
  (≤ 8 KB), `verifyIdToken(token, true)` so revoked sessions and disabled users are refused, verified email
  required, then the shared `resolveAppSession`. Responses are `no-store`.
- **Access decision on the server.** `features/mobile/repositories/mobile-session.repository.ts` returns
  `ALLOWED` only for a `TECHNICIAN` member with exactly one tenant-scoped technician profile
  (`technicians where organizationId == org and userId == uid`) that is not `INACTIVE`; office roles get
  `ROLE_NOT_SUPPORTED`, missing profiles `PROFILE_MISSING`. Ownership of `organizationSettings` and of the
  profile is re-checked; an invalid timezone falls back to `UTC`.
- **Error contract.** `401 TOKEN_EXPIRED` (the app retries once with a refreshed token), `401 SESSION_REVOKED`
  / `UNAUTHENTICATED` (the app signs out), `403 EMAIL_NOT_VERIFIED`, `403 ACCOUNT_UNAVAILABLE` with `reason`,
  `500` with a generic message. The app validates every response field before use.
- **Routing.** `src/app/_layout.tsx` maps one auth state to one `Stack.Protected` group
  (`ready` → `(app)`; `signedOut`/`loading` → sign in and forgot password; `unverified` → verify email;
  `blocked`/`error`/`misconfigured` → account status). The splash screen stays up until the first state is known.
- **Configuration.** Only public `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_API_URL` and emulator settings
  (`.env.example`); `.env*.local` is git-ignored. A build with missing settings shows which ones instead of crashing.

## UI

Same colour tokens as the web admin (primary `#176c58`, background `#fcfcf9`, borders `#dce3de`, sage
`#eaf1e5`), with a matching dark palette. Components in `src/components` (button, text field with show/hide
password, card, notice, status chip, SF Symbols / Material Symbols icons via `expo-symbols`). Status chips use
the web badge colour roles. Accessible labels, roles and live regions throughout; 48 pt touch targets.

## Files

Web — created: `src/lib/http/mobile-session.ts`, `src/features/mobile/**`, `src/app/api/mobile/session/route.ts`,
`scripts/test-mobile-session.mjs`; changed: `package.json` (`test:mobile-session`, included in `npm test`).

Mobile — created: `src/app/{_layout,sign-in,forgot-password,verify-email,account-status}.tsx`,
`scripts/test-auth.mjs` with `scripts/helpers/module-hooks.mjs` and `scripts/stubs/`,
`src/app/(app)/{_layout,index}.tsx`, `src/providers/auth-provider.tsx`, `src/lib/{env,format,validation}.ts`,
`src/lib/api/client.ts`, `src/lib/auth/**`, `src/lib/firebase/**`, `src/components/**`,
`src/types/firebase-auth.d.ts`, `eslint.config.js`, `.env.example`; changed: `app.json` (name ServiceFlow,
scheme `serviceflow`, splash colours), `package.json` (`firebase`, `@react-native-async-storage/async-storage`
2.2.0, ESLint, `typecheck` script), `tsconfig.json` (excludes `example`), `src/constants/theme.ts`,
`src/hooks/use-theme.ts`, `src/hooks/use-color-scheme.web.ts` (hydration via `useSyncExternalStore`, which the new
lint rules require), `README.md`. The Expo starter screens and README were moved to the git-ignored
`apps/mobile/example/` folder.

## Known limitations

No jobs yet. No push notifications or offline mode. App icons and splash artwork are still the Expo defaults.
Expo web is not a target: calling the API from a browser would need CORS, which the endpoint does not enable.

## Test checklist

Web: `npm test` (includes `test:mobile-session` 6/6), `npm run lint`, `npx tsc --noEmit`.
Mobile: `npm test` (8/8, runs without installing), then after `npm install` at the repository root, in
`apps/mobile`: `npm run typecheck`, `npm run lint` and `npx expo export --platform android --platform ios`.
Verified for this phase: all of the above, the exported bundles contain only `@firebase/auth`'s React Native build
(no Firestore or Storage), and a 16-step browser run of the web build against the Firebase Auth emulator and a
stand-in session API covered the paths listed next (a server error stood in for airplane mode, and a revoked
token for a disabled user), plus dark mode.

Still to check on real phones (iOS and Android, Expo Go or a development build): sign in as a technician with an active
profile (home screen), as a dispatcher (role message), as a technician without a profile and with an Inactive
profile, with a wrong password, with an unverified email (verify, then "I've verified"), forgot password,
airplane mode (connection message and Try again), disable the user in Firebase (signed out on next check),
and relaunch the app to confirm the session is kept.
