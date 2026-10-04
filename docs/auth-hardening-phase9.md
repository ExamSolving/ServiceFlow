# Authentication & security hardening — phase 9

## Scope

Fixes from the architecture and security audit that affect every protected page: session issuance, the redirect loop for accounts without a usable membership, CSRF and body-size handling for JSON routes, security headers, and the removal of client-side Firestore/Storage initialisation.

## Changes

- **Session issuance is gated.** `POST /api/auth/session` verifies the ID token, requires `email_verified`, requires `auth_time` within the last five minutes (`RECENT_LOGIN_REQUIRED`) and resolves the full `AppSession` (`resolveAppSession`) before minting the five-day HttpOnly cookie. Accounts without an active profile, membership or organization receive `403 ACCOUNT_UNAVAILABLE` with a reason code instead of a cookie that would redirect forever.
- **Redirect loop removed.** `getAppSessionState()` distinguishes `anonymous`, `unavailable` and `active`. `requireAuth` sends unavailable accounts to `/login?reason=account`, where the login form shows an explanatory notice with a sign-out action; the auth layout only redirects to the dashboard when a session actually resolves.
- **Logout revokes.** `POST /api/auth/logout` verifies the cookie, calls `revokeRefreshTokens` and clears the cookie.
- **Registration is transactional.** The owner's user, organization, membership (with denormalised display name/email) and settings documents are created in one transaction, idempotent on `defaultOrganizationId`.
- **Shared HTTP layer.** `lib/http/same-origin.ts` (Sec-Fetch-Site plus Origin against host / forwarded host), `lib/http/json.ts` (content type, streamed byte limit, Zod field errors) and `lib/http/api-session.ts` (`getApiSession(permission)` turning page redirects into 401/403 JSON) replace per-feature copies. All existing feature routes were migrated.
- **Headers.** `next.config.ts` sets `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS; the inert `/login` rewrite was removed.
- **Client SDK surface.** `lib/firebase/client.ts` exports only `auth` and `app`; Firestore and Storage are server-only through the Admin SDK, matching the deny-all rules.
- **Observability.** `lib/observability/logger.ts` replaces ad-hoc `console.*` calls in new code and redacts identifiers in production.
- Auth client flows (`features/auth/services/auth.client.ts`) use typed `AuthError` codes mapped to user-facing copy in `lib/utils/firebase-error.ts`, including the invitation acceptance and registration paths used by phase 10.

## Test checklist

Run `npm test`. Then: sign in with an unverified email (expect the verification prompt); sign in with a user whose membership was suspended (expect the account notice and a working sign-out); confirm a cross-site POST to any `/api/*` mutation returns 403; send a 1 MB JSON body (expect 413); check response headers on any page; confirm the browser bundle contains no Firestore client initialisation.
