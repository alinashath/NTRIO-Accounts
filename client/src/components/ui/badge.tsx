import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-0.5 rounded-[var(--radius-md)] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition-colors",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground",
        positive: "bg-positive/10 text-positive",
        negative: "bg-negative/10 text-negative",
        neutral: "bg-muted text-muted-foreground",
        outline: "border border-border bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
