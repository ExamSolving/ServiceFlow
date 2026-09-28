"use client";

import { Menu } from "@base-ui/react/menu";
import { Building2, ChevronDown, Loader2, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLogout } from "@/src/features/auth/hooks/use-logout";
import { ROLE_LABELS } from "@/src/lib/auth/permissions";
import type { ShellIdentity } from "../types/shell";

export function UserMenu({ identity }: { identity: ShellIdentity }) {
  const { signOut, loading, error } = useLogout();
  const name = identity.displayName || identity.email || "Your account";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Open user menu for ${name}`}
        className="flex min-h-11 items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-secondary font-heading text-xs font-semibold text-secondary-foreground"
          aria-hidden="true"
        >
          {initials}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-36 truncate text-xs font-medium">
            {name}
          </span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            {ROLE_LABELS[identity.role]}
          </span>
        </span>
        <ChevronDown
          className="hidden size-3.5 text-muted-foreground sm:block"
          aria-hidden="true"
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="end"
          sideOffset={10}
          className="z-50"
        >
          <Menu.Popup className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none">
            <div className="border-b border-border px-3 py-3">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {identity.email}
              </p>
              <Badge className="mt-3" variant="positive">
                {ROLE_LABELS[identity.role]}
              </Badge>
            </div>
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Building2 size={15} className="shrink-0" aria-hidden="true" />
              <span className="truncate">
                {identity.organizationName || "Your organization"}
              </span>
            </div>
            <Menu.Item
              closeOnClick={false}
              disabled={loading}
              onClick={signOut}
              className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-xs font-medium outline-none data-[highlighted]:bg-muted data-[disabled]:opacity-50"
            >
              {loading ? (
                <Loader2
                  size={16}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <LogOut size={16} aria-hidden="true" />
              )}
              {loading ? "Signing out…" : "Sign out"}
            </Menu.Item>
            {error && (
              <p
                role="alert"
                className="px-3 py-2 text-xs leading-5 text-destructive"
              >
                {error}
              </p>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
