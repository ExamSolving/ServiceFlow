import "server-only";

import { z } from "zod";

import { requirePermission } from "@/src/lib/auth/authorization";
import { adminDb } from "@/src/lib/firebase/admin";
import { logger } from "@/src/lib/observability/logger";
import { calendarDateSchema } from "@/src/features/dashboard/schemas/dashboard.schema";
import { dayRange, localDate } from "@/src/features/dashboard/utils/date";
import { listScheduledJobs, listUnscheduledJobs } from "@/src/features/jobs/repositories/job.repository";
import { jobIdSchema } from "@/src/features/jobs/schemas/job.schema";
import type { JobDetail } from "@/src/features/jobs/types/job";
import { parseWorkspaceSettings } from "@/src/features/workspace-settings/repositories/workspace-settings.repository";
import { listScheduleTechnicians } from "../repositories/schedule.repository";
import type { ScheduleData, ScheduleDay, ScheduleLane, ScheduleSearchParams, ScheduleViewMode } from "../types/schedule";

const filterSchema = z.object({
  date: calendarDateSchema.optional(),
  view: z.enum(["day", "week"]).default("day"),
  technician: z.union([z.literal("ALL"), jobIdSchema]).default("ALL"),
});

function shiftDate(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function weekStart(date: string, weekStartsOn: 0 | 1): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const offset = (day - weekStartsOn + 7) % 7;
  return shiftDate(date, -offset);
}

const dayLabel = (date: string) => new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const longLabel = (date: string) => new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

export async function getSchedulePage(searchParams: ScheduleSearchParams): Promise<ScheduleData> {
  const session = await requirePermission("dispatchJobs");
  let timezone = "UTC";
  let businessHours = { start: "09:00", end: "18:00" };
  let weekStartsOn: 0 | 1 = 1;
  try {
    const snapshot = await adminDb.collection("organizationSettings").doc(session.organizationId).get();
    const raw = snapshot.exists ? snapshot.data() : undefined;
    if (typeof raw?.timezone === "string" && raw.timezone) timezone = raw.timezone;
    const settings = parseWorkspaceSettings(snapshot.id, raw, session.organizationId);
    businessHours = { start: settings.businessHoursStart, end: settings.businessHoursEnd };
    weekStartsOn = settings.weekStartsOn;
  } catch (error) {
    logger.error("SCHEDULE", "Workspace settings could not be loaded", error);
  }
  const today = localDate(new Date(), timezone);
  const parsed = filterSchema.safeParse({ date: searchParams.date, view: searchParams.view, technician: searchParams.technician });
  const filters = parsed.success ? parsed.data : { date: undefined, view: "day" as ScheduleViewMode, technician: "ALL" };
  const date = filters.date ?? today;
  const view = filters.view;
  const start = view === "week" ? weekStart(date, weekStartsOn) : date;
  const dates = Array.from({ length: view === "week" ? 7 : 1 }, (_, index) => shiftDate(start, index));
  const range = { start: dayRange(dates[0], timezone).start, end: dayRange(dates[dates.length - 1], timezone).end };
  const technicianFilter = filters.technician;

  const [technicians, jobs, backlog] = await Promise.all([
    listScheduleTechnicians(session).catch((error) => { logger.error("SCHEDULE", "Technicians could not be loaded", error); return []; }),
    listScheduledJobs(session, range, technicianFilter === "ALL" ? undefined : technicianFilter).catch((error) => { logger.error("SCHEDULE", "Scheduled jobs could not be loaded", error); return null; }),
    listUnscheduledJobs(session).catch((error) => { logger.error("SCHEDULE", "Backlog could not be loaded", error); return []; }),
  ]);
  const scheduled: JobDetail[] = jobs ?? [];

  const byDate = new Map<string, JobDetail[]>();
  for (const job of scheduled) {
    if (!job.scheduledAt) continue;
    const key = localDate(new Date(job.scheduledAt), timezone);
    byDate.set(key, [...(byDate.get(key) ?? []), job]);
  }
  const days: ScheduleDay[] = dates.map((value) => ({ date: value, label: dayLabel(value), isToday: value === today, jobs: byDate.get(value) ?? [] }));

  const laneTechnicians = technicianFilter === "ALL" ? technicians : technicians.filter((technician) => technician.id === technicianFilter);
  const lanes: ScheduleLane[] = laneTechnicians.map((technician) => ({ technician, jobs: scheduled.filter((job) => job.assignedTechnicianId === technician.id) }));
  const laneIds = new Set(laneTechnicians.map((technician) => technician.id));
  const unassigned = scheduled.filter((job) => !job.assignedTechnicianId || !laneIds.has(job.assignedTechnicianId));
  if (unassigned.length) lanes.push({ technician: null, jobs: unassigned });

  return {
    date, today, view, timezone, businessHours, weekStartsOn, technicianFilter, technicians,
    rangeLabel: view === "week" ? `${dayLabel(dates[0])} – ${dayLabel(dates[6])}` : longLabel(date),
    previousDate: shiftDate(date, view === "week" ? -7 : -1),
    nextDate: shiftDate(date, view === "week" ? 7 : 1),
    lanes, days, backlog, totalScheduled: scheduled.length,
    ...(parsed.success ? {} : { filterError: "Some filters were invalid and have been reset." }),
    ...(jobs === null ? { filterError: "Scheduled jobs could not be loaded. Refresh to try again." } : {}),
  };
}
