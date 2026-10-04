import type { Metadata } from "next";

import { ScheduleView } from "@/src/features/schedule/components/schedule-view";
import { getSchedulePage } from "@/src/features/schedule/services/schedule.service";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await getSchedulePage(await searchParams);
  return <ScheduleView data={data} />;
}
