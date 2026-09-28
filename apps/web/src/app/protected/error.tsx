"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section
      role="alert"
      className="rounded-xl border border-border bg-card p-6 sm:p-8"
    >
      <CircleAlert
        className="mb-4 size-8 text-muted-foreground"
        aria-hidden="true"
      />
      <h1 className="text-xl font-semibold">We couldn’t load this page.</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Please try again. If the problem continues, check your connection and
        return in a moment.
      </p>
      <Button onClick={reset} className="mt-5 h-10 px-4">
        <RotateCcw size={16} aria-hidden="true" /> Try again
      </Button>
    </section>
  );
}
