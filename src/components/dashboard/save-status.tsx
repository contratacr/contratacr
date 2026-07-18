"use client";

import { Check, Loader2 } from "lucide-react";
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
  saved,
  dirty = false,
  className,
}: {
  saving: boolean;
  saved: boolean;
  dirty?: boolean;
  className?: string;
}) {
  const t = useTranslations("saveStatus");
  const show = saving || saved || dirty;

  return (
    <div
      className={cn(
        "flex h-6 items-center justify-end whitespace-nowrap transition-opacity duration-200",
        show ? "opacity-100" : "opacity-0",
        className
      )}
      aria-live="polite"
    >
      {saving ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#162543]">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("saving")}
        </span>
      ) : saved ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
          <Check className="h-4 w-4" /> {t("saved")}
        </span>
      ) : dirty ? (
        <span className="text-sm font-bold text-amber-700">{t("unsaved")}</span>
      ) : (
        // Keep the element present (fixed height) even when idle → no mount/unmount.
        <span className="text-sm">&nbsp;</span>
      )}
    </div>
  );
}
