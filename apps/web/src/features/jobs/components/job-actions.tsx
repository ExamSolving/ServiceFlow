"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { jobDetailSchema } from "../schemas/job.schema";
import type { JobDetail } from "../types/job";
import { canCancelJob } from "../utils/job-workflow";
export function JobActions({ job }: { job: JobDetail }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState("");
  if (!canCancelJob(job.status)) return null;
  async function cancel() {
    if (busy || done) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/jobs/${job.id}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "CANCEL", version: job.version }) });
      if (response.redirected || response.status === 401) { setError("Your session expired. Sign in again in another tab, then refresh this page."); return; }
      const body = await response.json().catch(() => null);
      if (!response.ok || !jobDetailSchema.safeParse(body?.job).success || body.job.id !== job.id) { setError(response.status === 409 ? "This job changed. Refresh the page before trying again." : "We couldn’t cancel this job. Please try again."); return; }
      setDone(true); router.refresh();
    } catch { setError("We couldn’t reach ServiceFlow. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3" aria-busy={busy || done}>
    {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" onClick={() => router.refresh()}>Refresh job</Button></div>}
    {confirm ? <div className="space-y-3 rounded-lg border border-border p-4"><p className="text-sm font-medium">Cancel this job?</p><p className="text-xs leading-5 text-muted-foreground">The record will be retained and become read-only. A linked service request stays converted and cannot create another job.</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || done} onClick={() => setConfirm(false)}>Keep job</Button><Button variant="destructive" disabled={busy || done} onClick={() => void cancel()}>{busy ? "Cancelling…" : done ? "Cancelled" : "Yes, cancel job"}</Button></div></div>
      : <Button variant="outline" onClick={() => setConfirm(true)}>Cancel job</Button>}
    {done && <p role="status" className="text-xs text-muted-foreground">Job cancelled. Refreshing…</p>}
  </div>;
}
