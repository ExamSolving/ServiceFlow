"use client";

import Link from "next/link";
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Layers2,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings2,
  ShieldCheck,
  Users,
  UsersRound,
  Warehouse,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import {
  isNavigationActive,
  type NavigationGroup,
  type NavigationIcon,
} from "../config/navigation";
import type { ShellIdentity } from "../types/shell";

const ICONS: Record<NavigationIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  customers: Users,
  technicians: Wrench,
  requests: ClipboardList,
  jobs: BriefcaseBusiness,
  schedule: CalendarDays,
  quotations: FileText,
  invoices: Receipt,
  payments: CircleDollarSign,
  products: Package,
  stock: Warehouse,
  organization: Building2,
  team: UsersRound,
  settings: Settings2,
};

export function Sidebar({
  identity,
  groups,
  pathname,
  collapsed = false,
  onCollapse,
  onNavigate,
}: {
  identity: ShellIdentity;
  groups: NavigationGroup[];
  pathname: string;
  collapsed?: boolean;
  onCollapse?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "flex h-20 shrink-0 items-center",
          collapsed ? "justify-center px-3" : "px-6",
        )}
      >
        <Link
          href="/dashboard"
          onClick={onNavigate}
          aria-label="ServiceFlow dashboard"
          className="flex items-center gap-2.5 rounded-lg text-sidebar-accent-foreground outline-offset-4 focus-visible:outline-2 focus-visible:outline-sidebar-ring"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-sidebar-accent/40 text-sidebar-primary">
            <Layers2 className="size-5" aria-hidden="true" />
          </span>
          {!collapsed && (
            <span className="font-heading text-xl font-semibold tracking-tight">
              ServiceFlow<span className="text-sidebar-primary">.</span>
            </span>
          )}
        </Link>
      </div>
      <div
        className={cn(
          "mx-3 mb-5 flex shrink-0 items-center gap-3 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/15",
          collapsed ? "justify-center p-2" : "px-3 py-3",
        )}
        title={identity.organizationName}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-sidebar-primary/15 text-sidebar-primary">
          <Building2 className="size-4" aria-hidden="true" />
        </span>
        <div className={cn("min-w-0", collapsed && "sr-only")}>
          <p className="truncate text-xs font-medium text-sidebar-accent-foreground">
            {identity.organizationName || "Your organization"}
          </p>
          <p className="mt-1 text-[10px] text-sidebar-foreground">
            Organization workspace
          </p>
        </div>
      </div>
      <nav
        aria-label="Main navigation"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5 [scrollbar-width:thin]"
      >
        {groups.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            <div
              className={cn(
                "mb-2 flex items-center justify-between px-3",
                collapsed && "sr-only",
              )}
            >
              <h2 className="text-[10px] font-medium uppercase tracking-[.14em] text-sidebar-foreground/80">
                {group.label}
              </h2>
              {group.items.every((item) => !item.available) && (
                <span className="text-[9px] text-sidebar-foreground/60">
                  Soon
                </span>
              )}
            </div>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isNavigationActive(pathname, item.href);
                const content = (
                  <>
                    <Icon
                      className="size-[18px] shrink-0"
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                    <span className={cn("truncate", collapsed && "sr-only")}>
                      {item.label}
                    </span>
                    {active && !collapsed && (
                      <span
                        className="ml-auto size-1.5 rounded-full bg-sidebar-primary"
                        aria-hidden="true"
                      />
                    )}
                  </>
                );
                const classes = cn(
                  "flex min-h-10 w-full items-center gap-3 rounded-lg border border-transparent px-3 text-xs transition-colors motion-reduce:transition-none",
                  collapsed && "justify-center px-0",
                  active && item.available
                    ? "border-sidebar-border/70 bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground",
                  item.available
                    ? "hover:bg-sidebar-accent/70 focus-visible:outline-2 focus-visible:outline-sidebar-ring"
                    : "cursor-not-allowed opacity-55",
                );
                return (
                  <li key={item.href}>
                    {item.available ? (
                      <Link
                        href={item.href}
                        prefetch={false}
                        onClick={onNavigate}
                        className={classes}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className={classes}
                        title={`${item.label} — coming in a future release`}
                        aria-label={`${item.label} — coming soon`}
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-sidebar-border/60 p-3">
        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={cn(
              "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-xs hover:bg-sidebar-accent/60 focus-visible:outline-2 focus-visible:outline-sidebar-ring",
              collapsed && "justify-center px-0",
            )}
            title={collapsed ? "Expand sidebar" : undefined}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose size={18} aria-hidden="true" />
                <span>Collapse sidebar</span>
              </>
            )}
          </button>
        ) : (
          <p className="flex items-center gap-2 px-3 py-2 text-xs">
            <ShieldCheck size={16} aria-hidden="true" /> Your organization
            workspace
          </p>
        )}
      </div>
    </div>
  );
}
