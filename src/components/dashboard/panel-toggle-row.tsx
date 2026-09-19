"use client";

import type { ReactNode } from "react";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
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

// Era una casilla pintada a mano; ahora es el mismo interruptor del resto del
// app (el de «Permitir llamadas»). Se conserva el nombre para no tocar a quien
// lo usa.
export function PanelSwitch({ checked, disabled = false }: { checked: boolean; disabled?: boolean }) {
  return <ToggleSwitch checked={checked} disabled={disabled} />;
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
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "inline-flex w-fit items-center gap-3 text-left text-sm font-semibold text-[#162543] transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
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
