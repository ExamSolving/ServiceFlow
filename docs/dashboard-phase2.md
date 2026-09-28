# ServiceFlow dashboard vertical slice

The dashboard is the first production data slice after the shared application shell. The route remains `/dashboard` for users and rewrites to the protected server route at `/protected/dashboard`.

## Architecture

`apps/web/src/app/protected/dashboard/page.tsx` only resolves the permission guard, search params, page header, and dashboard view. `getDashboard()` is a server-only service. It derives its tenant from `requirePermission("viewDashboard")` and the returned `AppSession`; the browser can submit only a calendar date.

The repository applies `organizationId == session.organizationId` to every collection query. Technician sessions are narrowed to the technician document linked to `session.uid` and then to jobs assigned to that document. Parsed documents are checked against the trusted organization again after every lookup. Firestore/Admin errors are logged server-side with a stable category and shown to users as generic retryable states.

The organization settings document supplies an IANA timezone when present. New organizations currently have no timezone field, so the service explicitly falls back to UTC and labels that fallback in the filter bar. Date ranges use the organization's local calendar day and handle daylight-saving transitions without assuming a 24-hour day.

Dashboard read access does not create an audit event. Mutating vertical slices must add audit entries with the same trusted session context before they are enabled.

## Data and UI

The dashboard provides date filtering, schedule and recent job lists, pending job counts, open service request counts, technician availability, role-scoped technician views, and a billing placeholder for roles that can view financials. The billing placeholder is deliberately unavailable until quotation/invoice data exists; no financial values are fabricated.

Loading, empty, partial-error, unavailable, and route-error states are included. Forms use React Hook Form with the dashboard Zod schema. The layout uses the existing Inter/Plus Jakarta Sans typography, Tailwind tokens, and shadcn primitives.

## Firestore

`firestore.indexes.json` contains the tenant plus schedule/created/status and technician/service-request indexes used by dashboard queries. `firestore.rules` is deny-by-default while all current web reads and writes go through Firebase Admin on the server. Deploy rules and indexes together with a reviewed mobile/client access policy before adding client-side CRUD.

## Test checklist

- `npm --workspace apps/web run lint`
- `npm --workspace apps/web run build`
- `npm --workspace apps/web run test:dashboard`
- Sign in as an owner/admin/manager/dispatcher and confirm the tenant-scoped organization summary, date filter, schedule, pending counts, recent jobs, open requests, and technician availability.
- Sign in as a technician and confirm only assigned jobs appear; verify an unassigned or another technician's job is never shown.
- Sign in as an accountant and confirm billing is labelled unavailable while operational sections are not exposed.
- Test an organization without `organizationSettings.timezone`; confirm UTC is labelled as the default.
- Test invalid, DST-transition, and timezone-offset dates; confirm the selected local calendar day is used.
- Verify empty organization collections, a failed section, a malformed document, and a denied role show safe UI states without raw Firebase errors.
- Check keyboard focus, labels, reduced-motion behavior, 390px mobile layout, tablet layout, and desktop sidebar collapse.

## Next phase

Organization Settings should add a tenant-authorized timezone and organization profile editor before Customers, so later dashboards and forms can use an explicit organization locale.
