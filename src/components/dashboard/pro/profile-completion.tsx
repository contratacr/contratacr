"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, ShieldCheck, X } from "lucide-react";
import { anyHealthCategory } from "@/lib/data/categories";

// Context-aware profile-completion (inspired by Airbnb's "complete your listing"
// checklist + LinkedIn's profile-strength meter). The PERCENT counts only the
// content the pro fully controls, so finishing the checklist always reaches 100%.
// Identity verification is approval-gated (and can't auto-pass for non-padrón IDs),
// so it's surfaced as a SEPARATE recommended action and never blocks 100%. Only
// fields that APPLY are listed (aseguradoras only for health; Spanish-only and
// "I have none" are never penalized). Each item is benefit-framed and jumps to the
// exact tab that completes it.

type ProRecord = Record<string, unknown>;

export type CompletionItem = {
  // `key` doubles as the i18n key (proPanel.completion.<key> / <key>Benefit).
  key: string;
  done: boolean;
  tab: string;
};

function hasLen(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

export function computeCompletion(pro: ProRecord): {
  percent: number;
  items: CompletionItem[];
  verified: boolean;
} {
  const profiles = (pro.profiles ?? {}) as { avatar_url?: string | null };
  const professions = (pro.professions as string[]) ?? [];

  // Location is "done" as soon as ANY location signal exists — independent of how
  // service_type is stored, so it never sticks for a pro who clearly set a zone.
  const hasLocation =
    hasLen(pro.workplaces) ||
    hasLen(pro.coverage_areas) ||
    hasLen(pro.coverage_provincias) ||
    !!pro.coverage_country ||
    !!pro.provincia_id ||
    !!pro.canton_id;

  const items: CompletionItem[] = [
    { key: "photo", done: !!profiles.avatar_url, tab: "profile" },
    // Any non-empty description counts as done (no minimum length).
    { key: "bio", done: typeof pro.bio === "string" && pro.bio.trim().length > 0, tab: "profile" },
    { key: "services", done: hasLen(pro.services), tab: "services" },
    { key: "location", done: hasLocation, tab: "profile" },
    { key: "whatsapp", done: typeof pro.whatsapp === "string" && pro.whatsapp.trim().length > 0, tab: "profile" },
  ];

  // Aseguradoras apply ONLY to health pros; for everyone else it doesn't exist,
  // so it's never counted as "missing".
  if (anyHealthCategory(professions)) {
    items.push({ key: "insurers", done: hasLen(pro.insurance_networks), tab: "profile" });
  }

  const done = items.filter((i) => i.done).length;
  const percent = Math.round((done / items.length) * 100);
  return { percent, items, verified: pro.verification_status === "verified" };
}

export function ProfileCompletion({ pro, onGo }: { pro: ProRecord; onGo: (tab: string, field?: string) => void }) {
  const t = useTranslations("proPanel.completion");
  const { percent, items, verified } = computeCompletion(pro);
  const missing = items.filter((i) => !i.done);
  const complete = percent === 100;

  // The OPTIONAL identity-verification invite is dismissible and must NOT keep nagging
  // once dismissed (persisted per-pro). The pro can still verify anytime from the
  // Verificación section. Verification never counts toward the % (it's separate/optional).
  const proId = typeof pro.id === "string" ? pro.id : "";
  const [dismissedVerify, setDismissedVerify] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { setDismissedVerify(localStorage.getItem(`contratacr_verify_dismissed_${proId}`) === "1"); } catch { /* noop */ }
  }, [proId]);
  function dismissVerify() {
    setDismissedVerify(true);
    try { localStorage.setItem(`contratacr_verify_dismissed_${proId}`, "1"); } catch { /* noop */ }
  }
  const showVerify = !verified && !dismissedVerify;

  // Nothing left to nudge: the profile is complete AND verification is either done or
  // has been dismissed. (Verification is OPTIONAL — its absence never blocks "complete".)
  if (complete && !showVerify) return null;

  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden mb-6">
      {/* Header — motivating headline, big live percent, linear strength meter. */}
      <div className="p-4 sm:p-6">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-[#111827]">
              {complete ? t("completeTitle") : t("title")}
            </h2>
            <p className="text-xs sm:text-sm text-[#6b7280] mt-0.5 leading-snug">
              {complete ? t("completeSubtitle") : t("subtitle")}
            </p>
          </div>
          <div className="shrink-0 leading-none">
            <span className="text-2xl sm:text-3xl font-bold tabular-nums text-[#111827]">{percent}</span>
            <span className="text-sm font-semibold text-[#9ca3af]">%</span>
          </div>
        </div>

        <div className="mt-3 h-2 w-full rounded-full bg-[#eef2f5] overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{
              width: `${Math.max(percent, 4)}%`,
              background: complete ? "#16a34a" : "linear-gradient(90deg,#009FD9,#33b4e0)",
            }}
          />
        </div>
        {!complete && (
          <p className="mt-2 text-xs font-medium text-[#009FD9]">{t("stepsLeft", { count: missing.length })}</p>
        )}
      </div>

      {/* Pending steps — flat rows split by light dividers (no nested boxes). Each
          row is a ≥44px tap target that jumps straight to the section to finish. */}
      {missing.length > 0 && (
        <ul className="border-t border-[#f3f4f6]">
          {missing.map((item) => (
            <li key={item.key} className="border-b border-[#f3f4f6] last:border-b-0">
              <button
                type="button"
                onClick={() => onGo(item.tab, item.key)}
                className="group flex w-full items-center gap-3 px-4 sm:px-6 py-3 text-left transition-colors hover:bg-[#f9fbfd] min-h-[56px]"
              >
                <span className="h-4 w-4 shrink-0 rounded-full border-2 border-[#d1d5db] transition-colors group-hover:border-[#009FD9]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[#111827]">{t(item.key)}</span>
                  <span className="block text-xs text-[#6b7280] mt-0.5 leading-snug">{t(`${item.key}Benefit`)}</span>
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-[#009FD9] shrink-0">
                  {t("completeAction")}
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
                <ChevronRight className="h-5 w-5 text-[#cbd5e1] shrink-0 sm:hidden" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Identity verification — a SEPARATE, OPTIONAL opportunity (never part of the % and
          never framed as "missing"). Dismiss is an explicit, LABELED "✕ Ahora no" control
          (not a bare corner ×) so it clearly reads as "ignore this optional suggestion";
          once dismissed it doesn't reappear (the pro can still verify from the Verificación
          section). */}
      {showVerify && (
        <div className="border-t border-[#f3f4f6] bg-[#f8fafc]">
          <div className="flex items-center gap-3 px-4 sm:px-6 py-3 min-h-[56px]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EBF5FB] text-[#009FD9]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            {/* Title + benefit — tap to go to Verificación. */}
            <button type="button" onClick={() => onGo("verificacion")} className="group min-w-0 flex-1 text-left">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-[#111827]">
                <span className="group-hover:text-[#009FD9] transition-colors">{t("verifyTitle")}</span>
                <span className="rounded-full bg-[#EBF5FB] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#009FD9]">
                  {t("optional")}
                </span>
              </span>
              <span className="block text-xs text-[#6b7280] mt-0.5 leading-snug">{t("verifyBenefit")}</span>
            </button>
            {/* Verificar CTA (desktop) */}
            <button
              type="button"
              onClick={() => onGo("verificacion")}
              className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#009FD9] hover:bg-[#EBF5FB] transition-colors"
            >
              {t("verifyAction")}
              <ChevronRight className="h-4 w-4" />
            </button>
            {/* Explicit, labeled dismiss — reads as "ignore this optional suggestion". */}
            <button
              type="button"
              onClick={dismissVerify}
              aria-label={t("dismissVerify")}
              title={t("dismissVerify")}
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-[#9ca3af] hover:bg-[#e5e7eb] hover:text-[#374151] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              {t("dismissVerify")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
