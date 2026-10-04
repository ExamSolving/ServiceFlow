import type { JobDetail } from "@/src/features/jobs/types/job";

export type ScheduleViewMode = "day" | "week";

export interface ScheduleTechnician { id: string; displayName: string; status: string }
export interface ScheduleDay { date: string; label: string; isToday: boolean; jobs: JobDetail[] }
export interface ScheduleLane { technician: ScheduleTechnician | null; jobs: JobDetail[] }

export interface ScheduleData {
  date: string;
  today: string;
  view: ScheduleViewMode;
  timezone: string;
  businessHours: { start: string; end: string };
  weekStartsOn: 0 | 1;
  technicianFilter: string;
  technicians: ScheduleTechnician[];
  rangeLabel: string;
  previousDate: string;
  nextDate: string;
  lanes: ScheduleLane[];
  days: ScheduleDay[];
  backlog: JobDetail[];
  totalScheduled: number;
  filterError?: string;
}

export type ScheduleSearchParams = Record<string, string | string[] | undefined>;
