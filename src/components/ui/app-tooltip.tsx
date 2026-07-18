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

export function AppTooltip({ label, children, className, tooltipClassName, side = "bottom", align = "end" }: AppTooltipProps) {
  const sideClass = side === "top" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]";
  const alignClass =
    align === "start"
      ? "left-0"
      : align === "center"
        ? "left-1/2 -translate-x-1/2"
        : "right-0";

  return (
    <span className={cn("group relative inline-flex w-fit shrink-0 align-middle leading-none", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 max-w-[210px] rounded-lg bg-[#162543] px-2.5 py-1.5 text-center text-[11px] font-bold leading-tight text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100",
          sideClass,
          alignClass,
          tooltipClassName,
        )}
      >
        {label}
      </span>
    </span>
  );
}
