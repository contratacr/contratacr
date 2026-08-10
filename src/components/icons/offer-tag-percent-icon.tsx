import { BadgePercent } from "lucide-react";

import { cn } from "@/lib/utils";

export function OfferTagPercentIcon({ className }: { className?: string }) {
  return (
    <BadgePercent
      aria-hidden="true"
      className={cn("shrink-0", className)}
      strokeWidth={2}
    />
  );
}
