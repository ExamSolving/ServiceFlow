import {
  Building2,
  Check,
  Layers2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { ROLE_LABELS } from "@/src/lib/auth/permissions";
import type { ShellIdentity } from "@/src/features/app-shell/types/shell";

export function WorkspaceWelcome({ identity }: { identity: ShellIdentity }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
      <section
        aria-labelledby="workspace-welcome-heading"
        className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8"
      >
        <div className="mb-6 flex items-center gap-2 text-xs font-medium text-primary">
          <span className="grid size-6 place-items-center rounded-full bg-secondary">
            <Check size={14} aria-hidden="true" />
          </span>{" "}
          Your workspace is ready
        </div>
        <span className="mb-5 grid size-12 place-items-center rounded-xl border border-border bg-muted text-primary">
          <Layers2 size={24} strokeWidth={1.4} aria-hidden="true" />
        </span>
        <h2
          id="workspace-welcome-heading"
          className="text-xl font-semibold tracking-tight sm:text-2xl"
        >
          A clear view of your work.
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-7 text-muted-foreground">
          Welcome to your organization&apos;s home in ServiceFlow. Your
          team&apos;s service operations will come together here as workspace
          tools become available.
        </p>
        <div className="mt-8 flex items-start gap-3 border-t border-border pt-5">
          <ShieldCheck
            size={18}
            className="mt-0.5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <p className="text-xs leading-6 text-muted-foreground">
            You&apos;re signed in to{" "}
            <span className="font-medium text-foreground">
              {identity.organizationName || "your organization"}
            </span>
            . Your role determines the tools you can access.
          </p>
        </div>
      </section>
      <aside
        aria-labelledby="workspace-details-heading"
        className="self-start rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 id="workspace-details-heading" className="text-sm font-semibold">
          Workspace details
        </h2>
        <dl className="mt-6 space-y-5">
          <div>
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              <Building2 size={14} aria-hidden="true" /> Organization
            </dt>
            <dd className="mt-2 break-words text-sm font-medium">
              {identity.organizationName || "Your organization"}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserRound size={14} aria-hidden="true" /> Signed in as
            </dt>
            <dd className="mt-2 break-words text-sm font-medium">
              {identity.displayName || "Team member"}
              <span className="mt-1 block break-all text-xs font-normal text-muted-foreground">
                {identity.email}
              </span>
            </dd>
          </div>
          <div className="border-t border-border pt-5">
            <dt className="text-xs text-muted-foreground">Your role</dt>
            <dd className="mt-2 inline-flex rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
              {ROLE_LABELS[identity.role]}
            </dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
