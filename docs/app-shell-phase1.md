# ServiceFlow — Phase 1 application shell

Status: implemented for review. Phase 2 has not started.

## Architecture

The existing `apps/web/src/app/protected/layout.tsx` remains the shared server entry point. It calls `requireAuth()` before rendering the shell. Existing cookie verification, Firebase Admin initialization, organization/membership checks, and request-scoped session memoization remain unchanged.

The layout sends only `displayName`, `email`, `organizationName`, and `role` to the interactive shell, along with role-filtered navigation. It does not expose session cookies, ID tokens, membership IDs, or tenant IDs as shell props. The browser cannot choose the organization.

`ApplicationShell` contains a sticky desktop sidebar, collapsible rail, responsive header, mobile modal drawer, user menu, skip link, and bounded content container. React local state controls navigation UI. The drawer and menu use the already-installed Base UI primitives used by the existing shadcn components: focus management, keyboard navigation, Escape, modal scroll locking, and accessible labels. No dependencies were added.

`PageHeader` accepts a title, description, breadcrumb items, and optional action content. Pages stay thin and pass their own labels; resource names need not be inferred from URL IDs.

`permissions.ts` defines the central role policy. The server-only `requirePermission()` helper authenticates first, then returns 404 for denied permissions. The dashboard calls it explicitly. Future pages, server services, and mutations must call the appropriate guard themselves; the protected layout and hidden menu items do not replace checks at data boundaries.

Only Dashboard is enabled. Planned modules are disabled, labelled coming soon, and filtered by role. There are no new Customers/Jobs endpoints, fake metrics, or tenant mutations. The welcome screen uses the current session's real organization and account identity.

The existing `/dashboard` rewrite to `/protected/dashboard` is preserved. Both paths share the same protected layout. New protected modules can be added incrementally using explicit routes/rewrites; route-group migration can be reviewed separately. The existing obsolete login rewrite was not changed in this phase.

Auth colors have been promoted into the global light-theme tokens; duplicate core auth overrides were removed. Sidebar tokens reuse the dark teal and sage auth palette. Inter, Plus Jakarta Sans, and Geist Mono are used through the existing font variables. No separate visual system was introduced.

Logout retains the existing POST endpoint and navigation behavior. Its UI behavior is shared in `useLogout`, with pending state and a safe retry message on failure.

## Files created

Paths below are relative to `/Users/nspira/Desktop/serviceflow`.

- `apps/web/src/features/app-shell/components/application-shell.tsx`
- `apps/web/src/features/app-shell/components/sidebar.tsx`
- `apps/web/src/features/app-shell/components/user-menu.tsx`
- `apps/web/src/features/app-shell/components/page-header.tsx`
- `apps/web/src/features/app-shell/config/navigation.ts`
- `apps/web/src/features/app-shell/types/shell.ts`
- `apps/web/src/features/dashboard/components/workspace-welcome.tsx`
- `apps/web/src/features/auth/hooks/use-logout.ts`
- `apps/web/src/lib/auth/permissions.ts`
- `apps/web/src/app/protected/loading.tsx`
- `apps/web/src/app/protected/error.tsx`
- `apps/web/scripts/test-app-shell.mjs`
- `docs/app-shell-phase1.md`

## Files modified

- `apps/web/src/app/protected/layout.tsx` — verified identity and filtered navigation feed the shared shell.
- `apps/web/src/app/protected/dashboard/page.tsx` — server permission guard, metadata, breadcrumb header, and welcome content.
- `apps/web/src/lib/auth/authorization.ts` — previously empty; now contains the server-only permission guard.
- `apps/web/src/features/auth/components/logout-button.tsx` — consumes the shared logout hook and displays failure feedback.
- `apps/web/src/app/globals.css` — shared auth-aligned theme and Geist Mono token.
- `apps/web/src/features/auth/components/auth.css` — inherits shared core theme tokens.

## Verification completed

- ESLint passed.
- `git diff --check` passed.
- 48 role/permission combinations tested, including server allow/deny behavior, authentication-first behavior, unknown-role denial, filtered navigation, and public/internal path matching.
- Real app: unauthenticated `/dashboard` and `/protected/dashboard` returned 307 to `/login`; `/login` returned 200.
- Desktop UI: expanded and collapsed sidebar, active Dashboard, user menu, organization identity, and role display.
- Mobile UI: 390px viewport without horizontal overflow; drawer opens, traps focus, closes on Escape, restores focus to its trigger, and closes after selecting Dashboard.
- Accountant preview showed Dashboard and financial navigation; Technician preview showed only Dashboard.
- Simulated logout failure showed a safe retry message and restored the Sign out action.

UI interaction checks used the actual shell components with a sample identity in a separate temporary local preview outside the repository. No auth bypass or preview route was added to the real application. The isolated preview was stopped after testing. The screenshot uses sample identity details. Real authenticated sign-in and successful logout with the user's own account remain on the manual checklist.

Full TypeScript checking still reports two pre-existing blockers:

- `apps/web/src/app/api/auth/me/route.ts` is empty and not a module.
- `.next/types/validator.ts` contains a stale reference to the missing `src/app/page.tsx`.

Neither was changed as part of the application-shell scope. A clean production build is not claimed. The protected error boundary handles child-route failures; auth failures in the enclosing layout remain handled by Next.js/parent boundaries as before.

## Commands

From the repository root:

```bash
npm run web
npm --workspace apps/web run lint
node apps/web/scripts/test-app-shell.mjs
```

Open `http://localhost:3000/dashboard` after starting the web server. During this session, the real app preview was started at `http://127.0.0.1:3100/dashboard`.

## Firebase changes

None. No Firestore indexes, Firestore rules, Storage rules, credentials, Firebase collections, or Cloud Functions changed. No tenant data was created or modified. Future data work must derive organizationId and actor IDs from the trusted AppSession and apply tenant filters/record ownership checks.

## Manual review checklist

- [ ] Sign in with your existing verified account and confirm Dashboard shows the correct organization, display name, email, and role.
- [ ] Collapse and expand the desktop sidebar; confirm the active route and icon labels remain clear.
- [ ] At mobile/tablet widths, open the drawer, navigate using keyboard, press Escape, and reopen it. Check focus returns to the trigger.
- [ ] Open the account menu with keyboard and pointer; confirm identity and role.
- [ ] Sign out successfully; confirm return to login. Revisit Dashboard and use browser Back; protected content should require authentication.
- [ ] Review navigation with existing authorized role accounts. Do not modify a user's role just for this test.
- [ ] Confirm planned modules are disabled and never lead to a 404 through navigation.
- [ ] Review long organization/user names and narrow phone layouts.
- [ ] Review colors and typography alongside login/register pages.
- [ ] Approve Phase 1 before starting dashboard data/UI work.

## Recommended Phase 2, after approval

Build the dashboard inside the shared shell: greeting, organization name, KPI components, today's schedule, pending actions, recent jobs, and technician availability, with loading/empty/error states. If sample values are used for design approval, label them as sample data. Keep New Job unavailable until a working authorized route exists. Replace approved sample data through server-only, tenant-scoped services. Customers, Jobs, and the mobile app remain later phases.
