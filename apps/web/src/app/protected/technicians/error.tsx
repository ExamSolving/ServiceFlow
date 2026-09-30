"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function TechniciansError({ retry }: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <Card role="alert" className="items-start p-6 sm:p-8">
      <CircleAlert className="size-7 text-muted-foreground" aria-hidden="true" />
      <div>
        <h1 className="text-xl font-semibold">We couldn’t load technicians.</h1>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          Try again in a moment. If the problem continues, contact your workspace owner.
        </p>
      </div>
      <Button onClick={retry}><RotateCcw aria-hidden="true" /> Try again</Button>
    </Card>
  );
}
