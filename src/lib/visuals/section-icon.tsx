import { createElement } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryIcon, sectionIcon, sectionIconForVertical, serviceGroupIcon } from "@/lib/visuals/section-visuals";

/**
 * The production «improved» icon (owner 2026-11-27): the round icons of the production app guide row (Profesionales ·
 * Negocios · Solicitudes · Promociones · Empleos, components/landing/guia-de-la-app.tsx) — the soft light-blue gradient box
 * `.ccr-caja-icono` (globals.css) with a navy #162543 outline glyph (stroke 1.8), as a circle; `active` is that row's
 * selected state: the brand-blue gradient with a white glyph and a soft blue glow (CAJA_ACTIVA there). Sizes change; the
 * glyph and the look never do. No hooks: usable from server and client components.
 */
const SIZES = {
  sm: { box: "h-8 w-8", glyph: "h-4 w-4" },
  md: { box: "h-9 w-9", glyph: "h-[18px] w-[18px]" },
  lg: { box: "h-11 w-11", glyph: "h-[22px] w-[22px]" },
  xl: { box: "h-14 w-14", glyph: "h-7 w-7" },
} as const;
export type VisualIconSize = keyof typeof SIZES;

export const IMPROVED_ICON_CIRCLE = "grid shrink-0 place-items-center rounded-full";
/** Same values as CAJA_ACTIVA of guia-de-la-app.tsx (production). */
export const IMPROVED_ICON_ACTIVE_STYLE = { background: "linear-gradient(135deg, #33b8ea 0%, #0089c2 100%)", boxShadow: "0 10px 22px -10px rgba(0, 137, 194, 0.8)" } as const;
export const IMPROVED_ICON_STROKE = 1.8;

/** The improved circle around a glyph that already comes from this module (sectionIcon / categoryIcon / serviceGroupIcon). */
export function IconBadge({ icon, size = "md", active = false, className, glyphClassName, data }: { icon: LucideIcon; size?: VisualIconSize; active?: boolean; className?: string; glyphClassName?: string; data?: Record<string, string> }) {
  return (
    <span aria-hidden="true" {...data} data-icon-active={active || undefined} className={cn(IMPROVED_ICON_CIRCLE, active ? "text-white" : "ccr-caja-icono", SIZES[size].box, className)} style={active ? IMPROVED_ICON_ACTIVE_STYLE : undefined}>
      {createElement(icon, { "aria-hidden": true, className: cn(SIZES[size].glyph, glyphClassName), strokeWidth: IMPROVED_ICON_STROKE })}
    </span>
  );
}

/** Icon of a business section, a section variant ("cafes:bares") or a directory vertical (`vertical`). */
export function SectionIcon({ id, vertical, size, active, className, glyphClassName }: { id?: string; vertical?: string; size?: VisualIconSize; active?: boolean; className?: string; glyphClassName?: string }) {
  const icon = vertical ? sectionIconForVertical(vertical) : sectionIcon(id ?? "");
  return <IconBadge icon={icon} size={size} active={active} className={className} glyphClassName={glyphClassName} data={{ "data-section-icon": id ?? vertical ?? "" }} />;
}

/** Icon of a professional service (its group's icon) or, with `group`, of a service group. */
export function CategoryIcon({ id, group, size, active, className, glyphClassName }: { id?: string; group?: string; size?: VisualIconSize; active?: boolean; className?: string; glyphClassName?: string }) {
  const icon = group ? serviceGroupIcon(group) : categoryIcon(id ?? "");
  return <IconBadge icon={icon} size={size} active={active} className={className} glyphClassName={glyphClassName} data={{ "data-category-icon": group ?? id ?? "" }} />;
}
