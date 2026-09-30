# Technicians

## Scope and design

This phase adds the technician directory, profile creation for existing technician members, profile details, contact edits, and availability management. Routes are `/technicians`, `/technicians/new`, `/technicians/[technicianId]`, and `/technicians/[technicianId]/edit`.

The existing `Technician` domain model and statuses (`AVAILABLE`, `BUSY`, `OFFLINE`, `ON_LEAVE`, `INACTIVE`) remain in use. A technician must link to an existing active member with the `TECHNICIAN` role in this organization and an active ServiceFlow user profile. Account invitations and account creation remain a later phase as specified in the original project brief. A manager cannot create accounts, grant roles, or move another organization's user into this workspace through this module.

Reuses PageHeader, Card, SectionHeading, EmptyState, Badge, Button, Input, Label, and Alert, with Lucide icons and the existing theme variables. Inter remains the interface font and Plus Jakarta Sans the heading font. Tables become readable mobile lists. Forms have labeled validation, safe error feedback, pending controls, and conflict handling that retains entries. No new UI library or client state store is introduced.

## Architecture and tenant security

Thin pages under `app/protected/technicians` reuse the existing protected shell. The public URL is exposed through a rewrite. Server services require `manageTechnicians`, preserving the existing owner/admin/manager permission policy. APIs call `requireAuth()` and perform permission checks outside database error handling so auth redirects are preserved. Repositories repeat permission checks and derive organization context exclusively from the trusted session.

All technician queries include the organization filter. Every technician and cursor lookup checks document ownership. Before reading a global user profile, the server verifies the selected membership's canonical document ID, organization ID, user ID, active state, and technician role. Creation revalidates membership/user eligibility inside the transaction. Updates cannot reassign `userId` or change the tenant. A suspended or disabled member can still have their operational profile marked inactive; returning them to another status requires valid membership again.

Both POST and PATCH validate strict Zod schemas and reject extra server-owned fields. Mutation handlers enforce same-origin/Fetch Metadata checks, JSON input, and safe error messages. No raw Firebase error or index URL is sent to the UI.

## Consistency and audit decisions

- One operational profile per organization/user, using a deterministic profile ID plus a tenant-scoped duplicate check for existing records.
- Employee numbers are assigned on the server as `TEC-000001`, using `technicianCounters/{organizationId}`.
- A creation request UUID is scoped to the actor and organization. A durable request ledger prevents duplicate creates and rejects reuse with different input.
- Technician, sequence, request ledger, and audit entry are committed atomically.
- Integer `version` checks reject stale edits. No-op saves do not bump versions or add audit records.
- Audit metadata records employee numbers or changed field names/version; phone numbers and member email addresses are not copied into it.
- Profile status changes affect operational availability. They do not disable Firebase accounts or revoke membership.

## Firestore changes

The existing `technicians` documents gain `nameSearch`, `version`, and server-only creation metadata. New `technicianCounters` and `technicianCreateRequests` collections support numbering and retry handling. Existing `auditLogs` receives technician creation/update events.

`firestore.indexes.json` adds technician name-search indexes with and without status, and an index for paginating eligible memberships by tenant/role/status. Existing dashboard technician indexes remain intact. Direct client Firestore access remains denied; this phase uses the Admin SDK behind server authorization.

Deploy the checked-in indexes to the intended Firebase project before using these queries in production:

```sh
firebase deploy --only firestore:indexes --project <your-project-id>
```

Local emulator tests do not confirm production index availability. This task does not deploy indexes or write live Firebase data.

During implementation, an isolated `demo-serviceflow-technicians` Auth/Firestore emulator project was used for real HTTP and browser checks. It covered role and tenant isolation, same-origin mutations, malformed input, create retries and concurrent duplicates, numbering, stale edits, member revocation, audit entries, dashboard integration, name/status filters, and a 28-record directory. A signed-in browser check created and edited a technician, and checked mobile, tablet, and desktop layouts for horizontal overflow. The emulators were stopped afterward.

If a tenant already has manually seeded technician records, backfill normalized `nameSearch` and a positive `version`, preserve IDs and user links, and initialize its counter above the maximum existing `TEC-` number. Resolve duplicate organization/user profiles before enabling creation. Creation will not silently restart an existing tenant's numbering sequence.

## Test commands

From `apps/web`:

```sh
npm run test:technicians
npm run test:customers
npm run test:dashboard
npm run test:organization-settings
node scripts/test-app-shell.mjs
npm run lint
npx tsc --noEmit --incremental false
npx next build --webpack
```

## Acceptance checklist

1. Sign in as owner, administrator, or manager. Confirm Technicians appears in navigation and directory/detail/create/edit pages load.
2. Without eligible members, confirm the page explains that an active Technician member must exist first. It must not create an account or change roles.
3. Select an eligible member and create their profile. Confirm server-assigned employee number, OFFLINE initial form default, and persistence after refresh.
4. Repeat a save after a simulated network interruption. Confirm one profile, one number, and one creation audit entry. Try a separate request for the same member and confirm a duplicate-link response.
5. Edit name, optional phone, and each availability state. Verify the directory badge, details page, and dashboard availability are consistent.
6. Open the same profile in two tabs. Save one and submit the stale form in the second; confirm a conflict and retained input.
7. Try foreign technician, member, and cursor IDs. Confirm no cross-organization data or profile linking is allowed.
8. Test disallowed roles and signed-out requests on both pages and APIs. Check malformed bodies and server-owned fields are rejected.
9. Suspend a test technician membership after opening the form. Creation/reactivation must be refused; marking an existing profile inactive must remain possible.
10. Check name-prefix search, each status filter, no matches, more than 25 results, member pagination, and invalid/stale cursor recovery.
11. Check mobile, tablet, and desktop layouts, keyboard focus, validation announcements, loading/empty/error states, and retry feedback.

## Next phase

Service Types. Skills, scheduling, assignment workflows, technician invitations, and the mobile app stay in their respective later phases.
