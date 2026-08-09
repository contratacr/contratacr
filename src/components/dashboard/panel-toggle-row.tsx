"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type PanelToggleRowProps = {
  title: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onToggle: () => void;
  icon?: LucideIcon;
  enabledLabel?: string;
  disabledLabel?: string;
  ariaLabel: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
};

export function PanelSwitch({ checked, disabled = false }: { checked: boolean; disabled?: boolean }) {
  return (
    <span
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center rounded-[4px] border bg-white transition-colors",
        checked ? "border-[#009FD9] bg-[#009FD9] text-white" : "border-[#b8c5d3] text-transparent",
        disabled && "opacity-55",
      )}
      aria-hidden="true"
    >
      <Check className="h-3.5 w-3.5 stroke-[3]" />
    </span>
  );
}

export function PanelToggleRow({
  title,
  checked,
  onToggle,
  ariaLabel,
  disabled = false,
  loading = false,
  className,
}: PanelToggleRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "inline-flex w-fit items-center gap-3 text-left text-sm font-semibold text-[#111827] transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {loading ? (
        <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" aria-hidden="true" />
      ) : (
        <PanelSwitch checked={checked} disabled={disabled} />
      )}
      <span>{title}</span>
    </button>
  );
}
