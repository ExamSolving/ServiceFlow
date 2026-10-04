"use client";

import { CalendarClock, LoaderCircle, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReferencePicker } from "@/src/features/service-requests/components/reference-picker";
import type { ServiceRequestOption } from "@/src/features/service-requests/types/service-request";
import { isoToZonedWallTime, zonedWallTimeToIso } from "@/src/lib/dates/zoned";
import { jobDetailSchema } from "../schemas/job.schema";
import type { JobDetail } from "../types/job";
import { canDispatchJob } from "../utils/job-workflow";

const resultSchema = z.object({ job: jobDetailSchema });

// Assign a technician and set the visit time in the organization's timezone.
export function JobDispatchForm({ job, timezone }: { job: JobDetail; timezone: string }) {
  const router = useRouter();
  const [technician, setTechnician] = useState<ServiceRequestOption | null>(job.assignedTechnicianId ? { id: job.assignedTechnicianId, name: job.assignedTechnicianName ?? "Assigned technician" } : null);
  const [wallTime, setWallTime] = useState(job.scheduledAt ? isoToZonedWallTime(job.scheduledAt, timezone) : "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<{ message: string; session?: boolean } | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  if (!canDispatchJob(job.status)) return null;

  async function save() {
    if (saving || done) return;
    setNotice(null);
    setFieldError(null);
    if (!technician) { setFieldError("Choose a technician."); return; }
    const scheduledAt = wallTime ? zonedWallTimeToIso(wallTime, timezone) : null;
    if (wallTime && !scheduledAt) { setFieldError("Enter a valid date and time."); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/dispatch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ technicianId: technician.id, scheduledAt, version: job.version }) });
      if (response.redirected || response.status === 401) { setNotice({ session: true, message: "Your session expired. Sign in in another tab, then refresh this page." }); return; }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = body && typeof body === "object" && "code" in body ? body.code : null;
        setNotice({ message: code === "INVALID_REFERENCE" ? "This technician is no longer active. Choose another technician."
          : code === "STATE" ? "This job’s status no longer allows dispatch changes. Refresh to see its latest state."
          : response.status === 409 ? "This job changed since you opened the page. Refresh before trying again."
          : response.status === 403 ? "You don’t have permission to dispatch jobs."
          : response.status === 400 ? "Check the technician and time, then try again."
          : "We couldn’t save the dispatch. Please try again." });
        return;
      }
      if (!resultSchema.safeParse(body).success) { setNotice({ message: "We couldn’t confirm the save. Refresh to check." }); return; }
      setDone(true);
      router.refresh();
    } catch {
      setNotice({ message: "We couldn’t reach ServiceFlow. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || done;
  return (
    <div className="space-y-4" aria-busy={busy}>
      {notice && <Alert variant="destructive"><AlertTitle>Dispatch wasn’t saved</AlertTitle><AlertDescription><p>{notice.message}</p>{notice.session && <Link href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>}</AlertDescription></Alert>}
      <ReferencePicker kind="technicians" endpoint="/api/jobs/options" fieldId="job-technician" label="Technician" noun="technician" hint="Only active technician profiles can be assigned." selected={technician} onSelect={setTechnician} disabled={busy} error={!technician && fieldError ? fieldError : undefined} />
      <div className="space-y-2">
        <Label htmlFor="job-scheduledAt">Visit date and time <span className="font-normal text-muted-foreground">({timezone})</span></Label>
        <div className="relative">
          <CalendarClock aria-hidden="true" className="pointer-events-none absolute left-3 top-3 z-10 size-4 text-muted-foreground" />
          <Input id="job-scheduledAt" type="datetime-local" step={300} value={wallTime} disabled={busy} className="pl-9" aria-invalid={Boolean(technician && fieldError)} aria-describedby="job-scheduledAt-hint" onChange={(event) => setWallTime(event.target.value)} />
        </div>
        {technician && fieldError ? <p role="alert" className="text-xs text-destructive">{fieldError}</p> : <p id="job-scheduledAt-hint" className="text-xs leading-5 text-muted-foreground">Leave empty to assign without a time; the job stays in the unscheduled backlog.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy} onClick={() => void save()}>{busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <UserRoundCheck aria-hidden="true" />}{done ? "Saved, refreshing…" : saving ? "Saving…" : job.assignedTechnicianId ? "Update dispatch" : "Assign technician"}</Button>
        {job.status === "ACCEPTED" && <p className="text-xs text-muted-foreground">Changing an accepted job re-sends it for acceptance.</p>}
      </div>
    </div>
  );
}
