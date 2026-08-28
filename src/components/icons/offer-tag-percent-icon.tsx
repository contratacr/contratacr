import { BadgePercent } from "lucide-react";

import { cn } from "@/lib/utils";

export function OfferTagPercentIcon({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <BadgePercent
      aria-hidden="true"
      className={cn("shrink-0", className)}
      strokeWidth={strokeWidth}
    />
  );
}
