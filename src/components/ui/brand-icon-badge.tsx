import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Polished icon badge — the same "colored icon on a light tint of its own color"
 * treatment as `SuccessIcon`: a pale circle with a subtle inset ring + soft glow,
 * holding the strong-colored icon. Use for empty / info / confirm states so they
 * look consistent and on-brand (not a flat grey circle).
 *
 * `tone` "brand" = brand blue (default); "success" = green; "warning" = amber;
 * "danger" = red (destructive confirms).
 * `size` is the circle diameter in px (the icon scales with it).
 */
export function BrandIconBadge({
  icon: Icon,
  size = 64,
  tone = "brand",
  className,
}: {
  icon: LucideIcon;
  size?: number;
  tone?: "brand" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    brand: "bg-[#EBF5FB] ring-[#009FD9]/20 shadow-[0_10px_30px_-10px_rgba(0,159,217,0.5)] text-[#009FD9]",
    success: "bg-emerald-50 ring-emerald-500/20 shadow-[0_10px_30px_-10px_rgba(16,185,129,0.45)] text-emerald-600",
    warning: "bg-amber-50 ring-amber-500/20 shadow-[0_10px_30px_-10px_rgba(245,158,11,0.45)] text-amber-600",
    danger: "bg-[#fef2f2] ring-[#ef4444]/20 shadow-[0_10px_30px_-10px_rgba(239,68,68,0.45)] text-[#ef4444]",
  };
  return (
    <span
      aria-hidden
      className={cn("relative inline-grid shrink-0 place-items-center rounded-full ring-1 ring-inset", tones[tone], className)}
      style={{ width: size, height: size }}
    >
      <Icon style={{ width: size * 0.44, height: size * 0.44 }} strokeWidth={2} />
    </span>
  );
}
