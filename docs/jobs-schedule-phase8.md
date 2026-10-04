# Jobs & Schedule — phase 8

## Scope

Jobs are the unit of field work. This phase completes the job lifecycle in the web admin: dispatch (assign a technician and a visit time), the full operational status workflow from the shared domain state machine, internal notes, an activity trail, and a Schedule page with day and week views plus an unscheduled backlog. Billing statuses (`INVOICED`, `PARTIAL`, `PAID`) are deliberately unreachable from the job UI; they are set by invoices and payments (phase 11).

Public routes: `/jobs`, `/jobs/new`, `/jobs/[jobId]`, `/jobs/[jobId]/edit`, `/schedule?date=&view=day|week&technicianId=`.

## Architecture and security

- Every entry point authenticates through `requirePermission("dispatchJobs")` (OWNER, ADMIN, MANAGER, DISPATCHER). Tenant context is always `AppSession.organizationId`; every read verifies ownership before data is exposed.
- `packages/domain/src/job-state-machine.ts` is the single source of allowed transitions. `features/jobs/utils/job-workflow.ts` wraps it: `canEditJob` (NEW only), `canCancelJob`, `canDispatchJob` (NEW, ASSIGNED, RESCHEDULED, ACCEPTED) and `webJobTransitions` (allowed moves minus billing statuses).
- `POST /api/jobs/[id]/transition` accepts a discriminated union: `{ action: "CANCEL", version }` or `{ action: "TRANSITION", to, version, note? }`. Field statuses (`ACCEPTED`, `EN_ROUTE`, `ARRIVED`, `IN_PROGRESS`) require an assigned technician. Reaching `COMPLETED` stamps `completedAt`.
- `POST /api/jobs/[id]/dispatch` takes `{ technicianId, scheduledAt | null, version }`. The technician must be an active profile of the same tenant (`AVAILABLE`, `BUSY`, `OFFLINE`, `ON_LEAVE`). Dispatch follows the state machine: `NEW → ASSIGNED`; an `ACCEPTED` job that changes hands or time passes through `RESCHEDULED → ASSIGNED` in one transaction; identical dispatches are no-ops. The technician's display name and the service type's estimated duration are captured on the job for the schedule.
- Visit times are converted between the organization timezone and UTC with `lib/dates/zoned.ts` (bisection, DST-safe) so a `datetime-local` value always means wall time in the organization's zone.
- Notes (`POST /api/jobs/[id]/notes`, `jobNotes/note_<hash>`) are idempotent per request id and immutable. The activity trail reads `auditLogs` for the job (`entityType = JOB`), newest first.
- `GET /api/jobs/options` serves the technician picker (active technicians, name-prefix search, ten per page).
- The Schedule service reads business hours, week start and timezone from `organizationSettings` (tolerant defaults), builds day/week ranges, and groups scheduled jobs into technician lanes plus an unassigned lane; the backlog lists open jobs (`NEW`, `ASSIGNED`, `RESCHEDULED`) without a visit time.
- Audit events: `JOB_CREATED`, `JOB_UPDATED`, `JOB_DISPATCHED` (with the status path) and `JOB_STATUS_CHANGED` (from/to and optional note). Notes are their own immutable records and are not duplicated into the audit log.

## UI

Job detail is a two-column layout: work details, dispatch card (technician picker + visit time in the organization timezone), notes, and on the right a status card with the allowed next statuses (each with an optional note and confirmation), record dates, billing documents (phase 11) and the activity trail. The schedule page offers day/week toggles, previous/today/next navigation, a technician filter and a backlog card, all with the existing theme tokens and shadcn primitives.

## Firestore

`jobs` gains `assignedTechnicianName`, `estimatedDurationMinutes`, `scheduledAt`, `completedAt`. New collection `jobNotes`. Indexes added: `jobNotes (organizationId, jobId, createdAt desc)`, `auditLogs (organizationId, entityType, entityId, createdAt desc)` and `jobs (organizationId, status, scheduledAt, createdAt desc)` for the backlog. Existing `jobs (organizationId, scheduledAt)` and `(organizationId, assignedTechnicianId, scheduledAt)` serve the schedule ranges.

## Files

Created: `features/jobs/{components/job-dispatch-form.tsx, job-notes.tsx, job-actions.tsx}`, `features/schedule/**`, `app/api/jobs/[jobId]/{dispatch,notes}`, `app/api/jobs/options`, `app/protected/schedule/**`, `lib/dates/zoned.ts`, `scripts/test-jobs-dispatch.mjs`. Changed: `features/jobs/{schemas,types,utils,repositories,services,components/job-detail-view.tsx}`, `features/service-requests/components/reference-picker.tsx` (configurable endpoint and option schema), `next.config.ts` (schedule rewrite), navigation (Schedule available).

## Test checklist

`npm run test:jobs`, `npm run test:jobs-dispatch`, then: dispatch a NEW job with and without a visit time; accept it and move it (expect RESCHEDULED → ASSIGNED in the activity trail); try to dispatch after EN_ROUTE (locked); walk a job to COMPLETED and confirm billing statuses are not offered; add notes; check the schedule day and week views across a DST boundary in a non-UTC organization timezone; confirm the backlog lists unscheduled open jobs only.
