# Organization settings phase

This phase adds the first owner-only administration slice at `/settings/organization`.

## Scope

- Organization name is editable; the stable slug is displayed read-only.
- Workspace timezone controls dashboard and scheduling date formatting.
- Job, invoice, and quotation prefixes are validated as 2–8 characters and normalized to uppercase.
- The page uses the existing protected shell and shared design primitives. It is responsive from mobile through wide desktop layouts.

## Architecture

The page is a thin Server Component. It calls `getOrganizationSettings`, which calls `requirePermission("manageOrganization")` before the server repository reads the organization and settings documents. The client form submits only editable fields to `PATCH /api/settings/organization`; it never sends an organization ID.

The API validates the body with Zod, verifies the request origin when one is present, and calls the server service. The repository derives both document references from `AppSession.organizationId`, verifies document ownership after every lookup, validates active organization state, and updates the organization and settings documents in one Firestore transaction.

## Firestore and audit changes

No client Firestore rules or composite indexes are needed. The project keeps Firestore client access denied and performs this mutation through the Admin SDK. A successful change writes `auditLogs/{id}` with action `ORGANIZATION_SETTINGS_UPDATED`, the trusted organization ID, actor UID, entity ID, and changed field names in the same transaction. A no-op save does not create an audit entry.

## Test checklist

1. Sign in as an `OWNER` and open **Administration → Organization**.
2. Confirm the page loads the registered organization name, slug, UTC default, and number prefixes.
3. Change the name, timezone, and one or more prefixes. Save and confirm the success state.
4. Refresh the page and dashboard; confirm the values persist and dashboard dates use the selected timezone.
5. Enter a one-character prefix, a nine-character prefix, or an invalid timezone. Confirm field-level validation and no write.
6. Sign in as another role and confirm the organization item is not available and the route is not accessible.
7. Review the audit log document for the changed field list.
