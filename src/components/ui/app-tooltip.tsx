"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AppTooltipProps = {
  label: string;
  children: ReactNode;
  className?: string;
  tooltipClassName?: string;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
};

export function AppTooltip({ children, className }: AppTooltipProps) {
  return (
    <span className={cn("group/tooltip relative inline-flex w-fit shrink-0 align-middle leading-none", className)}>
      {children}
    </span>
  );
}
