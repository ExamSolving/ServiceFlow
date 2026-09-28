"use client";

import { useRouter } from "next/navigation";
import { CircleAlert, RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function DashboardSectionError({ message }: { message: string }) {
  const router = useRouter();

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p>{message}</p>
        <Button
          type="button"
          variant="link"
          className="mt-1 h-auto p-0 text-xs text-destructive"
          onClick={() => router.refresh()}
        >
          <RotateCcw className="size-3" aria-hidden="true" />
          Refresh
        </Button>
      </div>
    </div>
  );
}

export function DashboardEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return <EmptyState title={title} description={description} />;
}

export function DashboardUnavailableState({ message }: { message: string }) {
  return (
    <div className="flex min-h-32 items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-5">
      <Settings2
        className="size-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="text-xs leading-5 text-muted-foreground">{message}</p>
    </div>
  );
}
