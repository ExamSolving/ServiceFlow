"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CalendarDays, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  dashboardFilterSchema,
  type DashboardFilterValues,
} from "../schemas/dashboard.schema";

export function DashboardFilters({
  date,
  today,
  timezone,
  timezoneDefaulted,
}: {
  date: string;
  today: string;
  timezone: string;
  timezoneDefaulted: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<DashboardFilterValues>({
    resolver: zodResolver(dashboardFilterSchema),
    defaultValues: { date },
  });

  function navigate(nextDate: string) {
    startTransition(() =>
      router.push(`${pathname}?date=${encodeURIComponent(nextDate)}`),
    );
  }

  function submit(values: DashboardFilterValues) {
    navigate(values.date);
  }

  return (
    <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end sm:justify-between sm:p-4">
      <form
        onSubmit={handleSubmit(submit)}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        aria-label="Dashboard date filter"
      >
        <div className="space-y-1.5">
          <Label htmlFor="dashboard-date" className="text-xs">
            Schedule date
          </Label>
          <div className="relative">
            <CalendarDays
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="dashboard-date"
              type="date"
              className="h-10 w-full pl-9 sm:w-44"
              min="2000-01-01"
              max="2100-12-31"
              disabled={isPending}
              aria-invalid={!!errors.date}
              {...register("date")}
            />
          </div>
          {errors.date && (
            <p className="text-xs text-destructive" role="alert">
              {errors.date.message}
            </p>
          )}
        </div>
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <CalendarDays className="size-4" aria-hidden="true" />
          )}
          Apply date
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending || date === today}
          onClick={() => {
            setValue("date", today, { shouldValidate: true });
            navigate(today);
          }}
        >
          Today
        </Button>
      </form>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <p className="text-[11px] text-muted-foreground">
          Times shown in {timezone}
          {timezoneDefaulted ? " (default)" : ""}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label="Refresh dashboard"
          disabled={isPending}
          onClick={() => startTransition(() => router.refresh())}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    </Card>
  );
}
