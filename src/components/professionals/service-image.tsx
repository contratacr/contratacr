"use client";

import { useState } from "react";
import { Home, Sprout, Sparkles, Laptop, Briefcase, Stethoscope, Scissors, GraduationCap, Truck, PartyPopper, ShieldCheck, Car, Wrench, type LucideIcon } from "lucide-react";
import { categoryImageUrl, categoryGroupId } from "@/lib/data/category-images";
import { cn } from "@/lib/utils";

// Per-GROUP branded fallback (on-brand gradient + icon) used when a category has no photo OR
// the photo fails to load — so EVERY service always shows a fitting visual.
const GROUP_VISUAL: Record<string, { from: string; to: string; Icon: LucideIcon }> = {
  hogar: { from: "#1e3a8a", to: "#2563eb", Icon: Home },
  jardin: { from: "#166534", to: "#16a34a", Icon: Sprout },
  limpieza: { from: "#0369a1", to: "#0ea5e9", Icon: Sparkles },
  tecnologia: { from: "#13294a", to: "#0f4c81", Icon: Laptop },
  profesional: { from: "#1e293b", to: "#334155", Icon: Briefcase },
  salud: { from: "#0e7490", to: "#06b6d4", Icon: Stethoscope },
  belleza: { from: "#9d174d", to: "#db2777", Icon: Scissors },
  educacion: { from: "#9a3412", to: "#ea580c", Icon: GraduationCap },
  transporte: { from: "#3730a3", to: "#4f46e5", Icon: Truck },
  eventos: { from: "#7e22ce", to: "#a855f7", Icon: PartyPopper },
  seguridad: { from: "#1e293b", to: "#475569", Icon: ShieldCheck },
  automotriz: { from: "#7f1d1d", to: "#dc2626", Icon: Car },
};
const DEFAULT_VISUAL = { from: "#0f4c81", to: "#009FD9", Icon: Wrench };

// The service's visual identity: a real catalog photo when available, else a branded
// gradient + the group icon. A small icon BADGE (group icon in a white rounded square)
// overlays the top-left of every card (matches the owner mockup). `className` controls the
// box (e.g. aspect ratio + rounding). `badge={false}` hides the overlay.
export function ServiceImage({ categoryId, className, badge = true }: { categoryId: string; className?: string; badge?: boolean }) {
  const url = categoryImageUrl(categoryId);
  const [failed, setFailed] = useState(false);
  const { from, to, Icon } = GROUP_VISUAL[categoryGroupId(categoryId)] ?? DEFAULT_VISUAL;
  const showPhoto = !!url && !failed;

  return (
    <div
      className={cn("relative overflow-hidden bg-[#eef1f5]", className)}
      style={showPhoto ? undefined : { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Icon className="h-[34%] w-[34%] text-white/85" strokeWidth={1.5} />
        </div>
      )}
      {badge && (
        <span className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-[#009FD9] shadow-sm backdrop-blur">
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
      )}
    </div>
  );
}
