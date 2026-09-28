"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Building2, Menu, X } from "lucide-react";
import { cn } from "cn";
import type { NavigationGroup } from "../config/navigation";
import type { ShellIdentity } from "../types/shell";
import { Sidebar } from "./sidebar";
import { UserMenu } from "./user-menu";

export function ApplicationShell({
  identity,
  navigation,
  children,
}: {
  identity: ShellIdentity;
  navigation: NavigationGroup[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (media.matches) setDrawerOpen(false);
    };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <div
      className={cn(
        "min-h-svh bg-background text-foreground lg:grid",
        collapsed
          ? "lg:grid-cols-[76px_minmax(0,1fr)]"
          : "lg:grid-cols-[248px_minmax(0,1fr)]",
      )}
    >
      <a
        href="#workspace-content"
        className="fixed left-4 top-3 z-[100] -translate-y-24 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground focus:translate-y-0"
      >
        Skip to main content
      </a>
      <aside
        aria-label="Desktop sidebar"
        className="sticky top-0 hidden h-dvh lg:block"
      >
        <Sidebar
          identity={identity}
          groups={navigation}
          pathname={pathname}
          collapsed={collapsed}
          onCollapse={() => setCollapsed((value) => !value)}
        />
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
              <Dialog.Trigger
                aria-label="Open navigation"
                className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
              >
                <Menu size={20} aria-hidden="true" />
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/40" />
                <Dialog.Popup className="fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(320px,calc(100vw-32px))] flex-col bg-sidebar shadow-xl outline-none">
                  <Dialog.Title className="sr-only">
                    Workspace navigation
                  </Dialog.Title>
                  <Dialog.Description className="sr-only">
                    Navigate your organization workspace. Modules marked coming
                    soon are not yet available.
                  </Dialog.Description>
                  <Dialog.Close
                    aria-label="Close navigation"
                    className="absolute right-3 top-5 z-10 grid size-10 place-items-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-sidebar-ring"
                  >
                    <X size={19} aria-hidden="true" />
                  </Dialog.Close>
                  <Sidebar
                    identity={identity}
                    groups={navigation}
                    pathname={pathname}
                    onNavigate={() => setDrawerOpen(false)}
                  />
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
            <Building2
              className="hidden size-4 shrink-0 text-muted-foreground sm:block"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium sm:text-sm">
                {identity.organizationName || "Your organization"}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Workspace overview
              </p>
            </div>
          </div>
          <UserMenu identity={identity} />
        </header>
        <main
          id="workspace-content"
          tabIndex={-1}
          className="mx-auto min-h-[calc(100svh-80px)] w-full max-w-[1600px] px-4 py-6 outline-none sm:px-8 sm:py-8 xl:px-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
