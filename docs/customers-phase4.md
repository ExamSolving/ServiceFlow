# Customers

## Delivered scope

- `/customers`: name-prefix search, all/active/inactive filters, and 25-record cursor pagination.
- `/customers/new`: create an individual or business customer.
- `/customers/[customerId]`: customer identity, contact information, notes, status, and timestamps.
- `/customers/[customerId]/edit`: edit contact details or deactivate/reactivate a customer without deleting history.
- Dedicated loading, empty, no-results, unavailable, and retryable error states. Desktop tables become contact cards on mobile.

## Architecture and authorization

Thin pages live under `app/protected/customers` and reuse the existing protected layout. A rewrite exposes the public `/customers` URLs. Server services call `requirePermission("manageCustomers")`; mutation routes call `requireAuth()` and enforce that permission. The existing policy permits owners, administrators, managers, and dispatchers.

Repositories accept only the trusted `AppSession` and repeat the permission check. The organization comes exclusively from `session.organizationId`. Strict request schemas reject `organizationId`, customer numbers, timestamps, and other server-owned fields. Customer and cursor document lookups validate the identifier and verify stored tenant ownership before returning data or writing. Missing and foreign customer IDs have the same unavailable response.

The React Hook Form form shares a Zod schema with the server. It submits to `POST /api/customers` or `PATCH /api/customers/[customerId]`. Mutation handlers check request origin, Fetch Metadata, JSON content type, body size, and field values. Errors sent to the browser contain safe messages rather than database details.

Creation uses a UUID request key scoped by organization and actor. Repeating the same creation request returns the original customer, preventing duplicate records after a network retry. A transaction allocates the next tenant-specific `CUS-000001` number and commits the counter, customer, and audit event together. Edits use an integer version to reject stale submissions; unchanged saves do not create audit events or increment the version.

## Design system reuse

Reuses PageHeader, Card, SectionHeading, EmptyState, Badge, Button, Input, Label, and Alert, with Lucide icons. The existing Inter/Plus Jakarta Sans typography, theme variables, shell, and authentication remain in place. Filters wrap and actions stack on narrow screens; forms use labeled controls with accessible validation and pending states.

## Firestore

New writes use the existing `customers` collection and add:

- `nameSearch`: normalized name for case-insensitive prefix queries.
- `version`: optimistic concurrency version, starting at 1.
- `createdBy`, `creationKey`, `creationPayloadHash`: server-only creation retry metadata.
- `customerCounters/{organizationId}`: trusted tenant ID, last allocated number, and update timestamp.
- `auditLogs`: `CUSTOMER_CREATED` / `CUSTOMER_UPDATED`, tenant and actor IDs, entity ID, and either customer number or changed field names/version. Contact details and notes are not copied into audit metadata.

Two composite indexes are declared in `firestore.indexes.json`:

1. `customers`: `organizationId ASC`, `nameSearch ASC`.
2. `customers`: `organizationId ASC`, `isActive ASC`, `nameSearch ASC`.

The document ID provides the final ordering tie-breaker. Direct client access remains denied by the existing Firestore rules. Mobile CRUD is not enabled by this phase.

Deploy the index declarations to the intended Firebase project and wait for them to become ready before using customer list queries there:

```sh
firebase deploy --only firestore:indexes --project <your-project-id>
```

This implementation does not deploy or modify live Firebase data. Emulator tests do not verify production index availability.

### Existing or imported customer documents

This is the first customer writer in the project. If a tenant already has manually imported records, migrate them before enabling this module: validate the existing domain fields, normalize absent optional email/notes to empty strings, retain Firestore timestamps, populate `nameSearch` using the shared normalizer, set a positive integer `version`, and initialize the tenant counter to at least the maximum existing numeric `CUS-` suffix. Preserve IDs and tenant ownership and verify customer numbers are unique within the tenant. Creation deliberately fails for a tenant with existing customers and no counter rather than reusing numbers. No migration is run automatically against live records.

## Repeatable checks

From `apps/web`:

```sh
npm run test:customers
node scripts/test-app-shell.mjs
npm run test:organization-settings
npm run test:dashboard
npm run lint
npx tsc --noEmit
npx next build --webpack
```

## Manual acceptance checklist

1. Sign in as an authorized operations role. Open Customers and confirm the initial empty state and Add customer action.
2. Create an individual and a business, with and without email/notes. Verify required name/phone validation, generated customer numbers, and persistence after refresh.
3. Edit contact information, deactivate the record, and reactivate it. Check the all/active/inactive filters and detail page status.
4. Search by the beginning of a customer name with different letter casing. Test no matches and Clear filters.
5. Create more than 25 records. Follow Next page, return to the first page, and confirm filters persist. Test duplicate names across page boundaries.
6. Open one record in two tabs. Save the first edit, then submit the stale second edit. Confirm a conflict and preservation of the unsaved input.
7. Retry an identical creation request after a simulated network failure. Confirm one customer, one allocated number, and one creation audit entry.
8. Check a second organization, a disallowed role, signed-out access, and a foreign customer/cursor ID. No data from another tenant should be shown or changed.
9. At mobile, tablet, and desktop widths, verify readable contact information, no horizontal page overflow, keyboard access, focus visibility, validation feedback, and pending controls.
10. Simulate a failed request and retry. Confirm safe error feedback and that successful changes appear in the list/detail views.

## Next phase

Technicians, after customer acceptance checks and production index deployment.
