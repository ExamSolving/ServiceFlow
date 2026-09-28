"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function WorkspaceError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card role="alert" className="p-6 sm:p-8">
      <CircleAlert
        className="mb-4 size-8 text-muted-foreground"
        aria-hidden="true"
      />
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        We couldn’t load this page.
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Please try again. If the problem continues, check your connection and
        return in a moment.
      </p>
      <Button onClick={reset} className="mt-5 h-10 px-4">
        <RotateCcw size={16} aria-hidden="true" /> Try again
      </Button>
    </Card>
  );
}
