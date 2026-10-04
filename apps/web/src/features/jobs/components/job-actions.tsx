"use client";

import { ArrowRight, LoaderCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { jobStatusLabel } from "@/src/features/dashboard/components/dashboard-format";
import { jobDetailSchema } from "../schemas/job.schema";
import type { JobDetail, JobStatus } from "../types/job";
import { webJobTransitions } from "../utils/job-workflow";

const resultSchema = z.object({ job: jobDetailSchema });
const DESTRUCTIVE: readonly JobStatus[] = ["CANCELLED", "REJECTED"];
const HELP: Partial<Record<JobStatus, string>> = {
  ASSIGNED: "Use the dispatch panel to assign a technician instead.",
  ACCEPTED: "The technician has accepted the visit.",
  REJECTED: "The technician declined; re-dispatch or cancel.",
  RESCHEDULED: "A new time is needed; update the dispatch panel afterwards.",
  EN_ROUTE: "Technician is travelling to the site.",
  ARRIVED: "Technician is on site.",
  DIAGNOSING: "Assessing the work before starting.",
  QUOTATION_REQUIRED: "A quotation must be prepared and approved.",
  WAITING_APPROVAL: "Quotation sent; waiting for the customer.",
  APPROVED: "Customer approved the quotation.",
  IN_PROGRESS: "Work has started.",
  ON_HOLD: "Paused; pick up again or cancel.",
  COMPLETED: "Work is finished; an invoice can be issued.",
  CLOSED: "Paid and closed; no further changes.",
  CANCELLED: "Closes the job permanently.",
};

// Status moves follow the shared job state machine; billing statuses are set by invoices.
export function JobActions({ job }: { job: JobDetail }) {
  const router = useRouter();
  const [pending, setPending] = useState<JobStatus | null>(null);
  const [confirm, setConfirm] = useState<JobStatus | null>(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<{ message: string; session?: boolean } | null>(null);
  // ASSIGNED is reached through the dispatch panel, which also records the technician.
  const options = webJobTransitions(job.status).filter((status) => status !== "ASSIGNED");
  if (!options.length) return <p className="text-xs leading-5 text-muted-foreground">{job.status === "CLOSED" ? "This job is closed." : job.status === "COMPLETED" ? "Completed. Issue an invoice to continue to billing." : "No further status changes are available here."}</p>;

  async function run(to: JobStatus) {
    if (pending || done) return;
    setPending(to);
    setNotice(null);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "TRANSITION", to, version: job.version, ...(note.trim() ? { note: note.trim() } : {}) }) });
      if (response.redirected || response.status === 401) { setNotice({ session: true, message: "Your session expired. Sign in again in another tab, then refresh this page." }); return; }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !resultSchema.safeParse(body).success) {
        const code = body && typeof body === "object" && "code" in body ? body.code : null;
        setNotice({ message: code === "STATE" ? "This change isn’t allowed from the job’s current status, or no technician is assigned yet. Refresh to see the latest state."
          : response.status === 409 ? "This job changed since you opened the page. Refresh before trying again."
          : response.status === 403 ? "You don’t have permission to change jobs."
          : response.status === 404 ? "This job is no longer available in your workspace."
          : "We couldn’t update this job. Please try again." });
        return;
      }
      setDone(true);
      setConfirm(null);
      router.refresh();
    } catch {
      setNotice({ message: "We couldn’t reach ServiceFlow. Check your connection and try again." });
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null || done;
  return (
    <div className="space-y-4" aria-busy={busy}>
      {notice && <Alert variant="destructive"><AlertTitle>Status wasn’t changed</AlertTitle><AlertDescription><p>{notice.message}</p>{notice.session ? <Link href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link> : <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}><RotateCcw aria-hidden="true" />Refresh</Button>}</AlertDescription></Alert>}
      <div className="space-y-2">
        <label htmlFor="job-transition-note" className="text-xs font-medium">Note for the activity log <span className="font-normal text-muted-foreground">(optional)</span></label>
        <textarea id="job-transition-note" rows={2} maxLength={500} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} placeholder="Why the status is changing" className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
      </div>
      {confirm ? (
        <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium">Mark this job as {jobStatusLabel(confirm).toLowerCase()}?</p>
          <p className="text-xs leading-5 text-muted-foreground">{HELP[confirm]} The record is retained and cannot be reopened.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setConfirm(null)}>Keep job</Button>
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void run(confirm)}>{pending === confirm ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}Yes, {jobStatusLabel(confirm).toLowerCase()}</Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {options.map((status) => (
            <li key={status} className="flex flex-col gap-1 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0"><p className="text-sm font-medium">{jobStatusLabel(status)}</p>{HELP[status] && <p className="text-xs leading-5 text-muted-foreground">{HELP[status]}</p>}</div>
              <Button type="button" size="sm" variant={DESTRUCTIVE.includes(status) ? "outline" : "secondary"} disabled={busy} onClick={() => DESTRUCTIVE.includes(status) ? setConfirm(status) : void run(status)}>
                {pending === status ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <ArrowRight aria-hidden="true" />}{DESTRUCTIVE.includes(status) ? jobStatusLabel(status) : `Mark ${jobStatusLabel(status).toLowerCase()}`}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {done && <p role="status" className="text-xs text-muted-foreground">Status updated. Refreshing…</p>}
    </div>
  );
}
