"use client";

import { AlertCircle, Ban, ClipboardCheck, LoaderCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ServiceRequestDetail } from "../types/service-request";
import { canEditServiceRequest } from "../utils/request-workflow";

type Action = "START_REVIEW" | "CANCEL";
type Notice = { kind: "error" | "session" | "conflict"; message: string };

// Workflow moves are versioned so two people acting on a stale page cannot both succeed.
export function ServiceRequestActions({ serviceRequest }: { serviceRequest: ServiceRequestDetail }) {
  const router = useRouter();
  const noticeRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [done, setDone] = useState(false);
  const busy = pending !== null || done;

  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  async function run(action: Action) {
    if (busy) return;
    setPending(action);
    setNotice(null);
    try {
      const response = await fetch(`/api/service-requests/${encodeURIComponent(serviceRequest.id)}/transition`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, version: serviceRequest.version }),
      });
      if (response.redirected || response.status === 401) {
        setNotice({ kind: "session", message: "Your session has expired. Sign in again in another tab, then refresh this page." });
        return;
      }
      if (!response.ok) {
        setNotice(response.status === 409
          ? { kind: "conflict", message: "This request changed since you opened the page. Refresh to see its latest status before trying again." }
          : { kind: "error", message: response.status === 403 ? "You don’t have permission to change service requests. Contact your workspace owner."
            : response.status === 404 ? "This service request is no longer available in your workspace."
            : "We couldn’t update this request. Please try again." });
        return;
      }
      setDone(true);
      setConfirmCancel(false);
      router.refresh();
    } catch {
      setNotice({ kind: "error", message: "We couldn’t reach ServiceFlow. Check your connection and try again." });
    } finally { setPending(null); }
  }

  if (!canEditServiceRequest(serviceRequest.status)) return null;

  return (
    <div className="space-y-4" aria-busy={busy}>
      {notice && <div ref={noticeRef} tabIndex={-1} className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"><Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{notice.kind === "session" ? "Sign in to continue" : notice.kind === "conflict" ? "Request has changed" : "Status wasn’t changed"}</AlertTitle><AlertDescription><p>{notice.message}</p>{notice.kind === "session" && <Link href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>}{notice.kind === "conflict" && <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}><RotateCcw aria-hidden="true" />Refresh</Button>}</AlertDescription></Alert></div>}
      {confirmCancel ? (
        <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium">Cancel this request?</p>
          <p className="text-xs leading-5 text-muted-foreground">It will be closed without scheduling. The record stays in your queue for reference and cannot be reopened.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setConfirmCancel(false)}>Keep request</Button>
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => { void run("CANCEL"); }}>{pending === "CANCEL" ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Ban aria-hidden="true" />}Yes, cancel request</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {serviceRequest.status === "NEW" && <Button type="button" disabled={busy} onClick={() => { void run("START_REVIEW"); }}>{pending === "START_REVIEW" ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <ClipboardCheck aria-hidden="true" />}{done && !pending ? "Updating…" : "Start review"}</Button>}
          <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmCancel(true)}><Ban aria-hidden="true" />Cancel request</Button>
        </div>
      )}
      <p role="status" className="text-xs leading-5 text-muted-foreground">{done ? "Status updated. Refreshing…" : serviceRequest.status === "NEW" ? "Start a review once your team has seen this request, or cancel it if the customer no longer needs it." : "Scheduling and conversion to a job arrive in a later phase. You can still cancel this request."}</p>
    </div>
  );
}
