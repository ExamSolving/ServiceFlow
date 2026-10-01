# Service Requests — phase 7

## Scope

Customer-raised work is captured as a service request before it becomes a job: customer, service type, title, description and priority, with a status workflow of `NEW → REVIEWING → CANCELLED` for this phase. Public routes are `/service-requests`, `/service-requests/new`, `/service-requests/[serviceRequestId]` and `/service-requests/[serviceRequestId]/edit`. Scheduling (`SCHEDULED`) and conversion to a job (`CONVERTED_TO_JOB`) are reserved statuses whose transitions arrive with the Jobs phase. Cancelled requests are retained and read-only.

## Architecture and security

- Thin pages call server services and repositories. Every server entry authenticates through `requireAuth()` / `requirePermission("manageServiceRequests")`, which allows OWNER, ADMIN, MANAGER and DISPATCHER. Navigation, pages, options and mutations share that policy. Tenant context comes exclusively from `AppSession.organizationId`.
- Every record and cursor lookup verifies ownership before exposing data. Every list and option query includes the organization predicate.
- The customer and service type a request points at must be **active records of the same tenant**. References are resolved inside the write transaction; a foreign, inactive or missing reference fails with `INVALID_REFERENCE` and the field name, without revealing anything about the foreign record. On edit, only a *changed* reference is re-validated, so a request can still be edited after its existing customer or service type was deactivated.
- The customer name/number and service type name are **captured on the request at save time** (a snapshot) so lists and details need no extra reads. The detail page links to the live records and says so.
- Strict Zod schemas reject organization, status, snapshot, audit and version fields from clients. Mutations enforce same-origin checks, JSON content and a streamed 32 KB body limit. Client errors never contain Firebase details.
- Creation uses an actor/tenant-scoped request UUID for retries; a completed creation stays replayable even if its references were deactivated afterwards. Optimistic versions protect edits and status changes; no-op saves create no audit entry.
- Status changes go through a separate `POST /api/service-requests/[id]/transition` with `{ action, version }`. `request-workflow.ts` is the single source of allowed moves (`START_REVIEW` from `NEW`; `CANCEL` from `NEW` or `REVIEWING`). Editing is refused once a request is no longer editable (`TRANSITION` conflict); the edit page redirects to the record.
- Audit events are `SERVICE_REQUEST_CREATED`, `SERVICE_REQUEST_UPDATED` and `SERVICE_REQUEST_STATUS_CHANGED`. Metadata carries version, changed fields and from/to status; titles and descriptions are not copied into audit logs.
- `GET /api/service-requests/options?kind=customers|serviceTypes&q=&cursor=` powers the form pickers. It returns only active same-tenant records (name plus customer number or estimated duration), ten per page, with prefix search on the existing `nameSearch` fields. The tenant is never a query parameter.

## UI reuse

Reuses PageHeader, SectionHeading, Card, Button, Input, Label, Alert, EmptyState, Badge and Lucide with the existing theme and fonts. The list has title search plus status and priority filters, a desktop table and a mobile list, newest-first ordering (title order while searching). The form uses React Hook Form with Zod, a searchable `ReferencePicker` for customer and service type, retained input on failures, and field-level feedback for inactive references, stale versions and locked statuses. The detail page shows a status card with **Start review** and a two-step **Cancel request** action; Edit is offered only while the request is editable.

## Firestore

`serviceRequests` stores `customerId`, `serviceTypeId`, `title`, `titleSearch`, `description`, `priority`, `status`, `customerName`, `customerNumber`, `serviceTypeName`, `organizationId`, `version`, `requestedAt`, `createdAt`, `updatedAt` and server-only creation metadata. Document IDs are `sr_<sha256(tenant, actor, requestId)>`. `auditLogs` receives atomic events. The dashboard's open-request count (`status in NEW, REVIEWING`) reads the same collection.

`firestore.indexes.json` adds eight `serviceRequests` indexes: organization (+ status, + priority, + both) with `requestedAt desc, __name__ desc` for the queue, and the same four combinations with `titleSearch asc, __name__ asc` for title search. Existing `customers` and `serviceTypes` organization/isActive/nameSearch indexes already cover the option pickers. Deny-all client rules are unchanged.

Deploy the checked-in indexes to the intended project before production use:

```sh
firebase deploy --only firestore:indexes --project <your-project-id>
```

This implementation does not deploy indexes or modify live Firebase data. If legacy `serviceRequests` documents exist (for example dashboard test data), backfill `titleSearch`, `customerName`, `customerNumber`, `serviceTypeName`, a positive `version`, `requestedAt` and valid `priority`/`status` values before rollout; records missing these fields are rejected on read.

## Files

Created: `apps/web/src/features/service-requests/` (repository, API/server services, list/detail/form/picker/actions/status/skeleton components; the schema, types, errors and workflow scaffolds were completed), `apps/web/src/app/protected/service-requests/` (list/new/detail/edit and loading/error/not-found), `apps/web/src/app/api/service-requests/` (POST, options GET, PATCH, transition POST), `apps/web/scripts/test-service-requests.mjs`, and this document.

Changed: `apps/web/next.config.ts` (rewrite), `apps/web/package.json` (`test:service-requests`), `apps/web/src/features/app-shell/config/navigation.ts` (entry now available under `manageServiceRequests`), `apps/web/scripts/test-app-shell.mjs` (permission matrix and expected navigation — the matrix had not been updated when `manageServiceRequests` was added), `apps/web/src/features/service-requests/schemas/service-request.schema.ts` (field-specific messages for the reference fields), and `firestore.indexes.json`.

## Test checklist

From `apps/web`, run `npm run test:service-requests`, the existing feature test scripts, `node scripts/test-app-shell.mjs`, `npm run lint`, `npx tsc --noEmit --incremental false`, and `npx next build --webpack`.

1. Sign in as owner/admin/manager/dispatcher. Open Service requests, log a request for an active customer and service type, and confirm the detail page, dashboard open-request count and refresh persistence.
2. In the pickers, search by name prefix, page with **Show more**, and confirm inactive customers/service types never appear. Deactivate a customer in another tab, then choose it from a stale picker list: expect the inactive-customer field error with entries retained.
3. Submit with a missing customer or service type, a two-character title, a short description and an invalid priority. Confirm validation and retained entries.
4. Retry the same creation after a lost response. Confirm one record and one creation audit.
5. Edit a request: change title, then change customer and service type. Confirm the snapshot names update and the audit lists the changed fields. Open two edit tabs, save one, then the other: expect the stale-version notice.
6. Start review, then cancel with the two-step confirmation. Confirm status badges, that Edit disappears, that `/edit` redirects to the record, and that the API refuses further edits and transitions.
7. Check more than 25 requests: newest-first ordering, title search ordering, status/priority filters, next/first page and invalid/foreign cursor recovery.
8. Test signed-out, technician and accountant requests; foreign record IDs; client organization/status injection; cross-site and oversized bodies. Confirm no unauthorized writes or data exposure.
9. Check keyboard focus, labels/error announcements, loading/empty/error states and mobile/tablet/desktop layouts without page overflow.

## Verification completed — September 30, 2026

- Service Requests repository/API tests: 14/14; Service Types 12/12; Technicians 16/16; Customers 8/8; dashboard, organization settings and all 60 shell role/permission combinations pass.
- ESLint and TypeScript (`--noEmit --incremental false`) pass.
- `next build` was not run in the sandbox used for this change (it could not download the platform SWC binary); run it locally before merging.
- No live Firebase records, authentication settings or deployed rules/indexes were changed.

Next phase: Jobs (scheduling requests, assigning technicians, `SCHEDULED` / `CONVERTED_TO_JOB` transitions).
