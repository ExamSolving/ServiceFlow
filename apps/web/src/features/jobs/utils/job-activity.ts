import { jobStatusLabel } from "@/src/features/dashboard/components/dashboard-format";
import type { JobActivity, JobStatus } from "../types/job";

/** One line for the job page's Activity list. Changes made in the technician app name the technician. */
export function describeJobActivity(entry: JobActivity): string {
  const meta = entry.metadata;
  const text = (key: string) => (typeof meta[key] === "string" && meta[key] ? String(meta[key]) : null);
  const status = (key: string) => {
    const value = text(key);
    return value ? (jobStatusLabel(value as JobStatus) ?? value) : null;
  };
  const viaApp = meta.source === "MOBILE" ? ` by ${text("actorName") ?? "the technician"} in the technician app` : "";
  switch (entry.action) {
    case "JOB_CREATED": return `Job created${text("jobNumber") ? ` as ${text("jobNumber")}` : ""}${text("serviceRequestId") ? " from a service request" : ""}.`;
    case "JOB_UPDATED": return `Details updated${Array.isArray(meta.changedFields) ? ` (${(meta.changedFields as string[]).join(", ")})` : ""}.`;
    case "JOB_DISPATCHED": return `Dispatched${status("to") ? ` · ${status("to")}` : ""}${text("scheduledAt") ? " with a visit time" : " without a visit time"}.`;
    case "JOB_STATUS_CHANGED": return `Status changed${status("from") ? ` from ${status("from")}` : ""}${status("to") ? ` to ${status("to")}` : ""}${viaApp}${text("note") ? ` — ${text("note")}` : ""}.`;
    case "JOB_DECLINED": return `Declined${viaApp}${text("reason") ? ` — ${text("reason")}` : ""}. The job is back with the office as Rescheduled.`;
    default: return entry.action.toLowerCase().replace(/_/g, " ");
  }
}
