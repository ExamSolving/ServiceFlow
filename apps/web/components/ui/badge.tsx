import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-border bg-muted text-muted-foreground",
        positive: "border-border bg-secondary text-secondary-foreground",
        attention: "border-border bg-accent text-accent-foreground",
        info: "border-primary/20 bg-primary/10 text-primary",
        destructive:
          "border-destructive/20 bg-destructive/10 text-destructive",
        outline: "border-border bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
export type BadgeVariant = NonNullable<
  VariantProps<typeof badgeVariants>["variant"]
>;
