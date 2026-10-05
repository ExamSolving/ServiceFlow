# Technician app: jobs — phase 15

## Scope

The technician's assigned jobs on the phone: a jobs list, job details with Call and Directions, status updates from
Accept job to Complete job, declining and pausing with a reason, and notes. Built across three places: a shared rule
in `packages/domain`, four technician-only routes in `apps/web`, and the screens in `apps/mobile`.

Decisions approved on 5 October 2026 (the recommended option for each):

1. **Decline** (and Can't make it) → *Rescheduled*, technician removed, visit time kept, reason in Activity.
2. **Updates need a connection** in this phase; jobs are readable offline. Queued updates are a later phase.
3. **Customer phone** only while the job is open; hidden once it is Completed, Cancelled or Rejected.
4. **Notes**: technicians see all notes on their own jobs.
5. **Home** shows the jobs first; the profile card and Sign out move to Settings.

## Shared rule — `packages/domain`

`src/job-technician-moves.ts`: `technicianMoves(status)` returns the 14 moves a technician may make, in the order the
app offers them (the first is the main next step), each with its input — `reason` (required), `note` (optional) or
`confirm`. Every move is filtered through `canTransitionJob`, so it can never disagree with the state machine.
`findTechnicianMove` and `isTechnicianDecline` (a move to Rescheduled) complete it.

| From | Moves (input) |
| --- | --- |
| Assigned | Accepted · Rescheduled (reason) |
| Accepted | En route · Rescheduled (reason) |
| En route | Arrived |
| Arrived | Diagnosing · In progress |
| Diagnosing | In progress · Quote needed (note) · On hold (reason) |
| Approved | In progress |
| In progress | Completed (confirm) · On hold (reason) |
| On hold | In progress |

Office only: New → Assigned (dispatch), Quote needed → Awaiting approval → Approved (quotations), billing statuses,
Cancelled, Rejected, Closed. Tests: `npm run domain:test` (`scripts/test-technician-moves.mjs`, 5 checks).
`npm run domain:check` uses this package's TypeScript 7, which ships a macOS binary only; it was also checked here with
the workspace's TypeScript 6 (`node_modules/.bin/tsc --noEmit -p packages/domain/tsconfig.json`).

## Web API — `apps/web`

| Route | Answers |
| --- | --- |
| `GET /api/mobile/jobs` | `{ jobs: { open, done, truncated, generatedAt } }` — open = Assigned through On hold plus Rescheduled, at most 100 (by visit time, unscheduled last); done = completed in the last 7 days, at most 30 |
| `GET /api/mobile/jobs/{id}` | `{ job }` — summary fields plus description, customer number, `customerPhone` (open jobs only), `notes` (latest 50), `history` (status changes, latest 20), `moves`, `canAddNote` |
| `POST /api/mobile/jobs/{id}/status` | Body `{ to, version, requestId, reason?, note? }` → `{ job }`, or `{ job: null }` after a decline |
| `POST /api/mobile/jobs/{id}/notes` | Body `{ body, requestId }` → `201 { note }` |

- **Access** — `requireMobileTechnician()` in `src/features/mobile/services/mobile-api.ts`: the `/api/mobile/session`
  checks (Bearer ID token with revocation, verified email, active membership) plus `readMobileSession` must return
  `ALLOWED` with a technician profile; otherwise `403 TECHNICIAN_UNAVAILABLE` with `access`.
- **Own jobs only** — `src/features/mobile/repositories/mobile-jobs.repository.ts` parses every job with the job page's
  own checks (`parseJobSnapshot`, now exported from `job.repository.ts`) and requires
  `assignedTechnicianId === technician.id`; anything else is `404 NOT_FOUND`.
- **Moves** run in a transaction: version check (`409 CONFLICT`), `findTechnicianMove` (`409 STATE`), reason check
  (`400 REASON_REQUIRED`), then the update (`completedAt` on Completed; a decline also clears `assignedTechnicianId`
  and `assignedTechnicianName`) and an audit entry: `JOB_STATUS_CHANGED`, or `JOB_DECLINED`, with
  `{ from, to, version, source: "MOBILE", technicianId, actorName, note | reason }`.
- **Idempotency** — the audit entry's ID is `mobile_<sha256(organizationId, uid, "job-move", requestId)>`; a repeat
  finds it and answers like the first request (a reused ID for a different move is `409 CONFLICT`). Notes use the
  web's scheme, `note_<sha256(organizationId, uid, requestId)>`, in the same `jobNotes` collection, with
  `source: "MOBILE"`.
- **Office pages refresh** after a change (`/protected/jobs`, the job, `/protected/schedule`, `/protected/dashboard`).
- **Activity text** moved to `src/features/jobs/utils/job-activity.ts` (`describeJobActivity`): app changes read
  *Status changed from Accepted to En route by Tess Fernandes in the technician app* (with the note after a dash),
  and declines *Declined by Tess Fernandes in the technician app — reason. The job is back with the office as
  Rescheduled.* Older entries read as before.
- **Rejected help text** on the job page now says *Closes the job permanently. To find another technician, use
  Rescheduled.* (it used to suggest re-dispatching, which Rejected doesn't allow).
- **Index** — `firestore.indexes.json` gains `jobs (organizationId, assignedTechnicianId, completedAt desc)` for the
  Done list. The open list uses the existing `(organizationId, assignedTechnicianId, status)` index.
- **Firestore rules** stay deny-all: the phone reads and writes only through these routes.

## App — `apps/mobile`

- **My jobs** (`src/app/(app)/index.tsx`): greeting, one-line profile, the sync banner, then *Now* (En route, Arrived,
  Diagnosing, In progress, Approved), *Today* (missed visits first, marked *Was due …*), *Coming up* by day,
  *No visit time yet*, *Waiting* (Quote needed, Awaiting approval, On hold, Rescheduled), and *Done in the last 7 days*.
  Grouping is by calendar day in the workspace time zone (`src/lib/jobs/sections.ts`).
- **A job** (`src/app/(app)/jobs/[id].tsx`): visit, customer with Call (`tel:`), address with Directions (Apple Maps,
  Android maps via `geo:`, Google Maps otherwise; via `expo-linking`), work, notes with an Add note box, status history,
  and the moves pinned at the bottom: the main next step plus **More options**. One-tap moves wait 4 seconds with
  **Undo**; leaving the screen in that window sends at once. Decline, Can't make it, Put on hold, Needs a quote and
  Complete job open a sheet (`src/components/jobs/move-sheet.tsx`).
- **Done** (`src/app/(app)/jobs/done.tsx`) and **Settings** (account card, availability note, Sign out — which now
  goes on to the sign-in screen).
- **Data** (`src/providers/jobs-provider.tsx`, `src/lib/jobs/`): the list is fetched after each confirmed account
  check, so it follows the phase 14 timers; each opened job is fetched on open and on pull to refresh. Responses are
  checked field by field (`parse.ts`). Moves and notes retry a dropped connection twice (2 s, 5 s) with the same
  request ID (`request-id.ts`, RFC 4122 v4). A refused request re-checks the account at most once a minute.
- **Saved copy** (`cache.ts`, `store.ts`): `serviceflow.jobs.v1` holds the list and opened jobs for one user, each
  used for at most 7 days (and never if dated more than 5 minutes ahead), and is deleted whenever the saved account
  check is (`forget()` in the auth provider).
- **Languages**: 91 new phrases in English, Hindi and Telugu, plus names for all 19 job statuses and 4 priorities (3 home
  screen phrases were removed). Hindi
  buttons avoid gendered first-person verbs (*साइट पर हूँ* for I've arrived). Needs a native speaker's review.

## Deploying

1. `firebase deploy --only firestore:indexes` — the Done list's query needs the new index.
2. Deploy the web app with the new routes. The phone works with older web deployments only up to sign-in.
3. Build the app as usual; no new native modules (`expo-linking` was already a dependency).

## Security notes

Every route checks the workspace and the job's assignment; other technicians' and other workspaces' jobs are
indistinguishable from missing ones. The phone keeps names, addresses and (for open jobs) phone numbers of the
technician's own jobs for up to 7 days; signing out deletes them. Request IDs only deduplicate requests from the same
user in the same workspace. Customer phone numbers are never in the list response, only in an open job's details.

## Test checklist

- `npm run domain:test` — 5/5.
- `apps/web`: `npm test` — all 15 suites, including the new `test:mobile-jobs` (13 checks: access, own jobs only, list
  groups and limits, detail with phone/notes/history, every move and refusal, retries, declines and re-dispatch,
  holds, strict bodies, notes, Activity wording, safe errors); `tsc --noEmit`; `eslint .`.
- `apps/mobile`: `npm test` — 37/37 (jobs 10/10); `npm run typecheck`; `npm run lint`;
  `npx expo export --platform ios --platform android`.
- Browser runs of the web build against the Auth emulator and a stand-in API: jobs 12/12 (list groups, job screen,
  Undo, a full walk to Completed with a note, Done, notes, a job changed by the office, a decline with a reason,
  offline reading with disabled moves, Hindi and Telugu, Settings and sign-out clearing saved jobs), plus sign-in
  16/16, languages 13/13 and offline session 12/12.

Still to check on real phones: Call and Directions opening the dialler and maps app; the Undo window when the screen
locks; switching off data in the middle of a move; long Hindi and Telugu button labels on small screens.

## Files

Created — domain: `src/job-technician-moves.ts`, `scripts/test-technician-moves.mjs`. Web:
`src/app/api/mobile/jobs/route.ts`, `…/[jobId]/route.ts`, `…/[jobId]/status/route.ts`, `…/[jobId]/notes/route.ts`,
`src/features/mobile/{repositories/mobile-jobs.repository.ts, schemas/mobile-jobs.schema.ts, services/mobile-api.ts,
types/mobile-jobs.ts}`, `src/features/jobs/utils/job-activity.ts`, `scripts/test-mobile-jobs.mjs`. App:
`src/app/(app)/jobs/[id].tsx`, `src/app/(app)/jobs/done.tsx`, `src/providers/jobs-provider.tsx`,
`src/lib/jobs/{api,cache,labels,parse,request-id,sections,store,types}.ts`,
`src/components/jobs/{job-group,job-row,job-status-chip,move-sheet}.tsx`, `src/components/ui/sheet.tsx`,
`src/hooks/use-now.ts`, `scripts/test-jobs.mjs`.

Changed — root `package.json` (`domain:test`), `packages/domain/{package.json, src/index.ts}`,
`firestore.indexes.json`; web `package.json` (`test:mobile-jobs`), `job.repository.ts` (`parseJobSnapshot`),
`job-detail-view.tsx`, `job-actions.tsx`; app `package.json`, `src/app/(app)/{_layout,index}.tsx`,
`src/app/settings.tsx`, `src/components/{icon,sync-banner}.tsx`, `src/components/ui/{screen,text-field}.tsx`,
`src/i18n/messages/{en,hi,te}.ts`, `src/lib/format.ts`, `src/providers/auth-provider.tsx`, `README.md`.
