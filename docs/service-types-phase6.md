# Service Types — phase 6

## Scope

One configurable service catalog across trades: name, optional description, estimated duration in minutes, and active/inactive state. Public routes are `/service-types`, `/service-types/new`, `/service-types/[serviceTypeId]`, and `/service-types/[serviceTypeId]/edit`. Inactive records are retained. Scheduling, prices, skills and service-request integration remain in their later phases.

## Architecture and security

- Thin pages use server services and repositories. Every server entry authenticates through `requireAuth()` / `requirePermission()`. Tenant context comes exclusively from `AppSession.organizationId`.
- The new `manageServiceTypes` permission allows OWNER, ADMIN and MANAGER. Navigation uses the same policy as pages and mutations.
- Every record and cursor lookup verifies ownership before exposing data. Every list/duplicate query includes the organization predicate.
- Strict Zod schemas reject organization, identity, audit and other server-owned fields. Mutations enforce same-origin checks, JSON content and a streamed body-size limit. Client errors never contain Firebase details.
- Creation uses an actor/tenant-scoped request UUID for retries. Optimistic versions protect edits; no-op saves create no audit entry.
- Names are unique within a tenant, including inactive records, after Unicode normalization, whitespace normalization and case folding. A name reservation and the service type/audit writes commit atomically. Renames keep the service type ID stable and transfer the reservation in the same transaction.
- Audit events are `SERVICE_TYPE_CREATED` and `SERVICE_TYPE_UPDATED`. Metadata contains version/changed fields; descriptions are not copied into audit logs.

## UI reuse

Reuses PageHeader, SectionHeading, Card, Button, Input, Label, Alert, EmptyState, Badge and Lucide. Inter and Plus Jakarta Sans and the existing theme remain in use. Forms use React Hook Form with Zod, retain input on failures, show duplicate-name/stale-edit guidance, and expose labeled validation and pending states. Desktop tables become mobile/tablet lists. Forms stack on smaller screens.

## Firestore

`serviceTypes` stores the four editable fields plus organizationId, nameSearch, version, timestamps and server-only creation metadata. `serviceTypeNames` stores deterministic tenant/name reservations. `auditLogs` receives atomic events. No counter is needed.

`firestore.indexes.json` adds organization/name and organization/active/name indexes with document-ID ordering. Existing deny-all client rules remain unchanged; only authorized server code uses Admin SDK access.

Deploy the checked-in indexes to the intended project before production use:

```sh
firebase deploy --only firestore:indexes --project <your-project-id>
```

This implementation does not deploy indexes or modify live Firebase data. Emulator success does not verify production index availability. If legacy service types exist, backfill valid description/duration/isActive, normalized nameSearch, positive version and timestamps; resolve duplicate normalized names and create matching name reservations before rollout. Preserve record IDs for future references.

## Files

Created: `apps/web/src/features/service-types/` (types, schemas, repository/errors, server/API services, list/detail/form/status/skeleton components), `apps/web/src/app/protected/service-types/` (list/new/detail/edit and loading/error/not-found), `apps/web/src/app/api/service-types/` (POST/PATCH), `apps/web/scripts/test-service-types.mjs`, and this document.

Changed: `apps/web/next.config.ts`, `apps/web/package.json`, `apps/web/scripts/test-app-shell.mjs`, `apps/web/src/features/app-shell/config/navigation.ts`, `apps/web/src/features/app-shell/components/sidebar.tsx`, `apps/web/src/lib/auth/permissions.ts`, and `firestore.indexes.json`. Prior Technicians changes are preserved.

## Test checklist

From `apps/web`, run `npm run test:service-types`, the existing feature test scripts, `node scripts/test-app-shell.mjs`, `npm run lint`, and `npx next build --webpack`.

1. Sign in as owner/admin/manager. Open Service types and create AC Repair with a description and duration. Confirm refresh persistence and detail/edit routes.
2. Try an empty/one-character name, invalid duration, and duplicate name with different case/spacing. Confirm validation and retained entries.
3. Retry the same creation request after a lost response. Confirm one record, one name reservation and one creation audit.
4. Rename and deactivate a service type. Confirm a stable ID, new name search, active/inactive filters and no permanent deletion. An inactive name remains reserved.
5. Open two edit tabs. Save one, then save the stale tab. Confirm conflict feedback and retained entries.
6. Check more than 25 records, name-prefix search, no matches, next/first page and invalid/deleted/foreign cursor recovery.
7. Test signed-out, dispatcher, technician and accountant requests; foreign record IDs; client organization injection; cross-site and oversized bodies. Confirm no unauthorized writes or data exposure.
8. Verify atomic rollback after failed create/rename, simultaneous duplicate-name attempts, no-op edits, and audit metadata.
9. Check keyboard focus, labels/error announcements, loading/empty/error states, and mobile/tablet/desktop layouts without page overflow.

## Verification completed — September 30, 2026

- Service Types repository/API tests: 12/12; Technicians: 16/16; Customers: 8/8. Dashboard, organization settings and all 54 shell role/permission combinations pass.
- ESLint, TypeScript (`--noEmit --incremental false`), whitespace checks and the production webpack build pass.
- The built application passed HTTP checks against isolated Firebase Auth/Firestore emulators: creation/replay, normalized duplicate names, simultaneous creates, rename/name release, inactive-name reservation, stale versions, foreign-tenant IDs, role enforcement, tenant injection, cross-origin rejection, page routes and paginated catalog rendering.
- Browser verification covered create-to-detail navigation, rename/deactivate, duplicate-name feedback with retained input, keyboard submission/navigation, pending state and search with no results. Tested mobile detail (390px), tablet form (768px) and desktop catalog (1440px) had no horizontal document overflow.
- No live Firebase records, authentication settings or deployed rules/indexes were changed. Production index availability and a full assistive-technology audit remain deployment/manual checks.

Next phase: Service Requests.
