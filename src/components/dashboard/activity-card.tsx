"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ActivityCard({
  expanded,
  children,
  className,
}: {
  expanded?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-2xl border-[#e5e7eb] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        expanded && "shadow-md ring-1 ring-[#d8eef8]",
        className,
      )}
    >
      {children}
    </Card>
  );
}

export function ActivityCardButton({
  expanded,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      className={cn(
        "group flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-[#f9fbfd] sm:gap-3.5 sm:p-5",
        expanded ? "rounded-t-2xl bg-[#fbfdff]" : "rounded-2xl",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ActivityIcon({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#0089bb]", className)}>
      <Icon className="h-[18px] w-[18px]" />
    </div>
  );
}

export function ActivityChevron({ expanded }: { expanded?: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
        expanded ? "border-[#ccecf8] bg-[#EBF5FB] text-[#009FD9]" : "border-[#eef2f6] bg-white text-[#9ca3af] group-hover:border-[#d8eef8] group-hover:text-[#009FD9]",
      )}
    >
      <ChevronDown className={cn("h-[18px] w-[18px] transition-transform duration-200", expanded && "rotate-180")} />
    </span>
  );
}

export function ActivityKeyFact({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-2 rounded-xl border border-[#ccecf8] bg-[#EBF5FB] px-3 py-2.5 text-[13px] font-semibold text-[#162543] sm:w-auto", className)}>
      <Icon className="h-4 w-4 shrink-0 text-[#009FD9]" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </span>
  );
}
