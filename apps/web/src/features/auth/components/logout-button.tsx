"use client";

import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLogout } from "../hooks/use-logout";

export function LogoutButton() {
  const { signOut, loading, error } = useLogout();
  return (
    <div>
      <Button variant="outline" onClick={signOut} disabled={loading}>
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <LogOut className="size-4" aria-hidden="true" />
        )}
        {loading ? "Signing out…" : "Sign out"}
      </Button>
      {error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
