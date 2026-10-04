"use client";

import { LoaderCircle, ShieldOff, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/src/lib/auth/permissions";
import { invitableRoles } from "../schemas/member.schema";
import type { TeamMember } from "../types/member";

const selectStyle = "h-9 min-w-36 rounded-lg border border-input bg-background px-2 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60";

async function readMessage(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : fallback;
}

// Role and access changes are versioned so two administrators cannot overwrite each other.
export function MemberActions({ member }: { member: TeamMember }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"role" | "status" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = member.role === "OWNER" || member.isSelf;

  async function send(path: string, method: "PATCH" | "POST", body: Record<string, unknown>, kind: "role" | "status") {
    setBusy(kind);
    setError(null);
    try {
      const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, version: member.version }) });
      if (response.redirected || response.status === 401) { setError("Your session has expired. Sign in again in another tab, then refresh."); return; }
      if (!response.ok) { setError(await readMessage(response, "We couldn’t save this change. Please try again.")); return; }
      setConfirm(false);
      router.refresh();
    } catch {
      setError("We couldn’t reach ServiceFlow. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  if (locked) {
    return <p className="text-xs text-muted-foreground">{member.role === "OWNER" ? "Workspace owner" : "This is you"}</p>;
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`role-${member.id}`}>Role for {member.displayName}</label>
        <select
          id={`role-${member.id}`}
          className={selectStyle}
          value={member.role}
          disabled={busy !== null || member.status !== "ACTIVE"}
          onChange={(event) => void send(`/api/members/${encodeURIComponent(member.id)}/role`, "PATCH", { role: event.target.value }, "role")}
        >
          {invitableRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
        </select>
        {confirm ? (
          <>
            <Button type="button" size="sm" variant="destructive" disabled={busy !== null} onClick={() => void send(`/api/members/${encodeURIComponent(member.id)}/status`, "POST", { action: "SUSPEND" }, "status")}>
              {busy === "status" ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <ShieldOff aria-hidden="true" />}Confirm suspend
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => setConfirm(false)}>Keep</Button>
          </>
        ) : member.status === "SUSPENDED" ? (
          <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void send(`/api/members/${encodeURIComponent(member.id)}/status`, "POST", { action: "REACTIVATE" }, "status")}>
            {busy === "status" ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <ShieldCheck aria-hidden="true" />}Reactivate
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => setConfirm(true)}>
            <ShieldOff aria-hidden="true" />Suspend
          </Button>
        )}
      </div>
      {busy === "role" && <p role="status" className="text-xs text-muted-foreground">Updating role…</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
