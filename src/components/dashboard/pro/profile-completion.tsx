"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, X } from "lucide-react";
import { AppTooltip } from "@/components/ui/app-tooltip";

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

function hasCompleteServiceInfo(v: unknown): boolean {
  if (!Array.isArray(v) || v.length === 0) return false;
  return v.every((service) => {
    if (!service || typeof service !== "object") return false;
    const years = (service as { years?: unknown }).years;
    const months = (service as { months?: unknown }).months;
    return (typeof years === "number" && years > 0) || (typeof months === "number" && months > 0);
  });
}

export function computeCompletion(pro: ProRecord): {
  percent: number;
  items: CompletionItem[];
  verified: boolean;
} {
  const profiles = (pro.profiles ?? {}) as { avatar_url?: string | null };
  const hasProfilePhoto =
    !!profiles.avatar_url ||
    (typeof pro.avatar_url === "string" && pro.avatar_url.trim().length > 0);

  // Location is "done" as soon as ANY location signal exists — independent of how
  // service_type is stored, so it never sticks for a pro who clearly set a zone.
  const hasLocation =
    hasLen(pro.workplaces) ||
    hasLen(pro.coverage_areas) ||
    hasLen(pro.coverage_provincias) ||
    !!pro.coverage_country ||
    !!pro.provincia_id ||
    !!pro.canton_id;
  const hasSelectedServices = hasLen(pro.professions) || !!pro.category_id;
  const hasServiceInfo = hasCompleteServiceInfo(pro.services);

  const items: CompletionItem[] = [
    { key: "photo", done: hasProfilePhoto, tab: "profile" },
    // Any non-empty description counts as done (no minimum length).
    { key: "bio", done: typeof pro.bio === "string" && pro.bio.trim().length > 0, tab: "profile" },
    { key: hasSelectedServices ? "serviceInfo" : "services", done: hasServiceInfo, tab: "services" },
    { key: "location", done: hasLocation, tab: "profile" },
    { key: "whatsapp", done: typeof pro.whatsapp === "string" && pro.whatsapp.trim().length > 0, tab: "profile" },
  ];

  // Aseguradoras are OPTIONAL (even for health pros) — never a completion step, so
  // they add no "incomplete profile" pressure.

  const done = items.filter((i) => i.done).length;
  const percent = Math.round((done / items.length) * 100);
  return { percent, items, verified: pro.verification_status === "verified" };
}

export function ProfileCompletion({ pro, onGo }: { pro: ProRecord; onGo: (tab: string, field?: string) => void }) {
  const t = useTranslations("proPanel.completion");
  const { percent, items, verified } = computeCompletion(pro);
  const missing = items.filter((i) => !i.done);
  const complete = percent === 100;

  // The ONLY optional step in the completion flow is identity VERIFICATION (sprint 396 —
  // kept the flow short; Disponibilidad and Casos de éxito are NOT flow steps, they're
  // discoverable as their own sidebar tabs in Modo profesional). Dismissible, never nags
  // again, and NEVER counts toward the %.
  const proId = typeof pro.id === "string" ? pro.id : "";
  const [dismissedVerify, setDismissedVerify] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem(`contratacr_verify_dismissed_${proId}`) === "1"; } catch { return false; }
  });
  function dismiss() {
    setDismissedVerify(true);
    try { localStorage.setItem(`contratacr_verify_dismissed_${proId}`, "1"); } catch { /* noop */ }
  }

  const optionalItems: { key: string; titleKey: string; benefitKey: string; tab: string; field?: string; actionKey: string }[] = [];
  if (!verified && !dismissedVerify)
    optionalItems.push({ key: "verify", titleKey: "verifyTitle", benefitKey: "verifyBenefit", tab: "profile", field: "verification", actionKey: "verifyAction" });

  // Nothing left to nudge: essentials complete AND verification done/dismissed.
  if (complete && optionalItems.length === 0) return null;

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
              background: "linear-gradient(90deg,#009FD9,#33b4e0)",
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

      {/* OPTIONAL extras — identity verification + profile ENHANCEMENTS (Disponibilidad,
          Casos de éxito). Styled IDENTICALLY to the required rows (same hollow-circle
          bullet, padding, divider, hover) — the ONLY differences are the "Opcional" tag,
          the action CTA, and an explicit LABELED "✕ Ahora no" dismiss (so it reads as
          "ignore this optional suggestion", not "missing"). None affect the %. */}
      {optionalItems.length > 0 && (
        <ul className="border-t border-[#f3f4f6]">
          {optionalItems.map((opt) => (
            <li key={opt.key} className="border-b border-[#f3f4f6] last:border-b-0">
              <div className="group flex w-full items-center gap-3 px-4 sm:px-6 py-3 min-h-[56px] transition-colors hover:bg-[#f9fbfd]">
                <span className="h-4 w-4 shrink-0 rounded-full border-2 border-[#d1d5db] transition-colors group-hover:border-[#009FD9]" />
                <button type="button" onClick={() => onGo(opt.tab, opt.field)} className="min-w-0 flex-1 text-left">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-[#111827] group-hover:text-[#009FD9] transition-colors">{t(opt.titleKey)}</span>
                    <span className="rounded-full bg-[#EBF5FB] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#009FD9]">
                      {t("optional")}
                    </span>
                  </span>
                  <span className="block text-xs text-[#6b7280] mt-0.5 leading-snug">{t(opt.benefitKey)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onGo(opt.tab, opt.field)}
                  className="hidden sm:inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#009FD9]"
                >
                  {t(opt.actionKey)}
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
                <AppTooltip label={t("dismissVerify")}>
                  <button
                    type="button"
                    onClick={dismiss}
                    aria-label={t("dismissVerify")}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#9ca3af] hover:bg-[#e5e7eb] hover:text-[#374151] transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                    {t("dismissVerify")}
                  </button>
                </AppTooltip>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
