"use client";

import { LoaderCircle, RefreshCw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import type { InvitationDetail } from "../types/member";
import { InvitationLink } from "./invitation-link";

const responseSchema = z.object({ invitation: z.object({ acceptPath: z.string().nullable().optional() }) });

export function InvitationActions({ invitation }: { invitation: InvitationDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"regenerate" | "revoke" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "regenerate" | "revoke") {
    setBusy(kind);
    setError(null);
    try {
      const response = await fetch(`/api/members/invitations/${encodeURIComponent(invitation.id)}/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: invitation.version }) });
      if (response.redirected || response.status === 401) { setError("Your session has expired. Sign in again in another tab, then refresh."); return; }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "We couldn’t update this invitation. Please try again.");
        return;
      }
      const parsed = responseSchema.safeParse(body);
      if (kind === "regenerate" && parsed.success && parsed.data.invitation.acceptPath) setLink(parsed.data.invitation.acceptPath);
      setConfirm(false);
      router.refresh();
    } catch {
      setError("We couldn’t reach ServiceFlow. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {link && <InvitationLink acceptPath={link} email={invitation.email} />}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void act("regenerate")}>
          {busy === "regenerate" ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden="true" />}{invitation.status === "EXPIRED" ? "New link" : "Regenerate link"}
        </Button>
        {confirm ? (
          <>
            <Button type="button" size="sm" variant="destructive" disabled={busy !== null} onClick={() => void act("revoke")}>{busy === "revoke" ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <XCircle aria-hidden="true" />}Confirm revoke</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => setConfirm(false)}>Keep</Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => setConfirm(true)}><XCircle aria-hidden="true" />Revoke</Button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
