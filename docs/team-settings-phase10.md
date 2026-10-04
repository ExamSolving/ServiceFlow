# Team & Settings — phase 10

## Scope

Workspace administration: inviting and managing team members, and general workspace settings (currency, tax default, quotation validity, invoice due days, business hours, week start). Public routes: `/settings` (general), `/settings/team`, `/settings/organization` (existing), and the public `/invite/[token]` acceptance page.

## Architecture and security

- Team management requires `manageUsers` (OWNER, ADMIN); general settings require `manageOrganization` (OWNER).
- Invitations never send email in this phase. `POST /api/members/invitations` creates `invitations/inv_<hash>` storing only a token **hash**, returns the one-time accept link (`/invite/<token>`) exactly once, and expires after seven days. Links can be regenerated or revoked. Invitable roles exclude OWNER.
- Acceptance (`POST /api/invitations/accept`) takes a Firebase ID token (verified email required) and the raw token, verifies the hash, the pending state, the expiry and that the signed-in email matches the invitation, then creates or merges `users/{uid}` and `memberships/{org}_{uid}` and marks the invitation accepted — all in one transaction with a `MEMBER_JOINED` audit. The normal session cookie is then issued through `/api/auth/session`, which now resolves the new membership.
- Member actions (`PATCH /api/members/[id]/role`, `POST /api/members/[id]/status` with `SUSPEND`/`REACTIVATE`) are version-checked, forbid changing the owner or yourself, and are idempotent for repeated status changes. Suspended members lose access immediately because `resolveAppSession` requires an active membership.
- Workspace settings live on the shared `organizationSettings/{org}` document with a tolerant read schema (`.catch` defaults) so documents written before a field existed still load. `readWorkspaceDefaults` is reused by billing and the schedule.
- Audit events: `INVITATION_CREATED`, `INVITATION_LINK_REGENERATED`, `INVITATION_REVOKED`, `MEMBER_ROLE_CHANGED`, `MEMBER_SUSPENDED`, `MEMBER_REACTIVATED`, `MEMBER_JOINED`, `WORKSPACE_SETTINGS_UPDATED`.

## UI

Team page: member table with role and status controls, pending invitations with copy-link, regenerate and revoke, and an invite form. Settings page: a single form for billing and scheduling defaults with field-level validation. The invite page runs outside the protected shell and offers sign-in or registration for the invited email.

## Firestore

New collection `invitations` (`organizationId`, `email`, `role`, `status`, `tokenHash`, `expiresAt`, `invitedBy`, timestamps). Index added: `invitations (organizationId, status, createdAt desc)`. Token lookups use the single-field `tokenHash` index.

## Files

Created: `features/members/**`, `features/workspace-settings/**`, `app/api/members/**`, `app/api/invitations/accept`, `app/api/settings/workspace`, `app/protected/settings/{page,loading}.tsx`, `app/protected/settings/team/**`, `app/(invite)/**`, `scripts/test-members.mjs`. Changed: navigation (Team and Settings available), `next.config.ts` (settings rewrites), auth client/services for invitation flows.

## Test checklist

`npm run test:members`, then: invite a user, open the link in a private window, register with a different email (expect the mismatch error), register with the invited email, verify it and accept; confirm the member appears with the invited role; suspend them and confirm their next request lands on the account notice; try to change your own role or the owner's (refused); regenerate a link and confirm the old one is rejected; save settings with closing time before opening time (refused) and confirm billing documents pick up the new defaults.
