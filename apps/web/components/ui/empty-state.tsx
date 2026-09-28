import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "cn";

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center",
        className,
      )}
    >
      <Icon
        className="mb-3 size-6 text-muted-foreground/70"
        aria-hidden="true"
      />
      <p className="font-heading text-sm font-semibold tracking-tight">
        {title}
      </p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
