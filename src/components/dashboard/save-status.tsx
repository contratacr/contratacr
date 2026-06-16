"use client";

import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * ONE app-wide save-state indicator. The whole app autosaves; this is the
 * consistent "Guardando… / Guardado / Sin guardar" feedback every editable
 * section shows so users always know their changes are persisted. Place it
 * right-aligned at the top of each section for a uniform position.
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

  // When fully idle there's nothing to show — render NOTHING (no reserved empty
  // row) so a section's TITLE sits tidily next to its content instead of leaving a
  // gap below it. The status row only appears during/after a save (or when there
  // are unsaved changes), where a brief reserved height keeps it from flickering.
  if (!saving && !saved && !dirty) return null;

  return (
    <div className={cn("flex justify-end items-center min-h-[20px]", className)} aria-live="polite">
      {saving ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6b7280]">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("saving")}
        </span>
      ) : saved ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
          <Check className="h-4 w-4" /> {t("saved")}
        </span>
      ) : dirty ? (
        <span className="text-sm font-medium text-amber-600">{t("unsaved")}</span>
      ) : null}
    </div>
  );
}
