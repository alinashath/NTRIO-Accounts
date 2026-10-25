import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-0.5 rounded-xs px-1.5 py-0.5 text-xs font-semibold leading-4 tabular-nums",
  {
    variants: {
      variant: {
        default: "bg-neutral-bg text-neutral-ink",
        positive: "bg-credit-bg text-credit-ink",
        negative: "bg-debit-bg text-debit-ink",
        neutral: "bg-neutral-bg text-neutral-ink",
        outline: "border border-border bg-transparent text-muted-label",
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
