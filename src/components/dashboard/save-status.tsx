"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * ONE app-wide save-state indicator. The whole app autosaves; this is the
 * consistent "Guardando… / Guardado / Sin guardar" feedback every editable
 * section shows so users always know their changes are persisted.
 *
 * ZERO LAYOUT IMPACT — two guarantees, so the content NEVER moves when the status
 * appears / disappears / changes:
 *  1) It is ALWAYS mounted at a FIXED height (`h-5`) and only toggles OPACITY +
 *     text — it never mounts/unmounts, so it never adds/removes height.
 *  2) It is rendered as an ABSOLUTE OVERLAY pinned to the section title's top-right
 *     (via `HeaderSaveStatus`, or a title-row overlay) — it sits OUTSIDE the normal
 *     document flow, so its presence/size can't push or reflow anything. The title
 *     keeps a fixed right padding so its text never runs under the status.
 * `whitespace-nowrap` keeps the label on one line inside the overlay.
 */
export function SaveStatus({
  saving,
  saved: _saved,
  dirty = false,
  className,
}: {
  saving: boolean;
  saved: boolean;
  dirty?: boolean;
  className?: string;
}) {
  const t = useTranslations("saveStatus");
  void _saved; // Keep the prop for compatibility; saved state is now represented transiently via guarding logic.
  const show = saving || dirty;

  return (
    <div
      className={cn(
        "flex h-5 items-center justify-end whitespace-nowrap transition-opacity duration-200",
        show ? "opacity-100" : "opacity-0",
        className
      )}
      aria-live="polite"
    >
      {saving ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6b7280]">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("saving")}
        </span>
      ) : dirty ? (
        <span className="text-sm font-medium text-amber-600">{t("unsaved")}</span>
      ) : (
        // Keep the element present (fixed height) even when idle → no mount/unmount.
        <span className="text-sm">&nbsp;</span>
      )}
    </div>
  );
}
