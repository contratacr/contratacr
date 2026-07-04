"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Mode } from "@/hooks/use-mode";

/* The Airbnb-style FULL mode switch as a polished SEGMENTED CONTROL (Carbon-style
   content switcher / iOS segmented control): the two worlds (Cliente / Profesional)
   shown side by side, the active one FILLED (brand), the inactive one muted but
   clearly tappable — tapping it switches the whole experience. Accessible
   (role=tablist/tab, ArrowLeft/Right operable), smooth fill transition, fits ~360px.
   `block` makes the two segments share the full width.

   Used anywhere the account needs to change context in place (panel header and
   account navigation menus). Only render it for accounts with BOTH modes (providers). */
export function ModeSwitcher({
  mode,
  onSwitch,
  block = false,
  className,
}: {
  mode: Mode;
  onSwitch: (m: Mode) => void;
  block?: boolean;
  className?: string;
}) {
  const t = useTranslations("header");
  const segments: { value: Mode; label: string }[] = [
    { value: "use", label: t("modeClientShort") },
    { value: "offer", label: t("modeProShort") },
  ];
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") { e.preventDefault(); onSwitch("use"); }
    else if (e.key === "ArrowRight") { e.preventDefault(); onSwitch("offer"); }
  }
  return (
    <div
      role="tablist"
      aria-label={t("modeSwitchAria")}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#f3f4f6] p-0.5 select-none",
        block && "flex w-full",
        className,
      )}
    >
      {segments.map((seg) => {
        const active = mode === seg.value;
        return (
          <button
            key={seg.value}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSwitch(seg.value)}
            className={cn(
              "relative inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-all duration-200",
              block && "flex-1",
              active
                ? "bg-[#008ce0] text-white shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
                : "text-[#6b7280] hover:text-[#162543]",
            )}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
