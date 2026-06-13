"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, Circle, ChevronRight, Sparkles } from "lucide-react";
import { anyHealthCategory } from "@/lib/data/categories";

// Context-aware profile-completion checklist. Goal: minimal signup, then guide
// the pro to finish. Only counts fields that APPLY (aseguradoras only for health;
// Spanish-only and "I have none" are never penalized). Each item is benefit-framed
// so the pro understands WHY it helps, and links to the tab that completes it.

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

export function computeCompletion(pro: ProRecord): { percent: number; items: CompletionItem[] } {
  const profiles = (pro.profiles ?? {}) as { avatar_url?: string | null };
  const professions = (pro.professions as string[]) ?? [];
  const serviceType = String(pro.service_type ?? "");
  const isMobile = serviceType.includes("mobile");
  const isFixed = serviceType.includes("fixed");

  const hasLocation =
    (isFixed && hasLen(pro.workplaces)) ||
    (isMobile && (hasLen(pro.coverage_areas) || hasLen(pro.coverage_provincias) || !!pro.coverage_country)) ||
    // Legacy/simple: a primary provincia is enough.
    !!pro.provincia_id;

  const items: CompletionItem[] = [
    { key: "photo", done: !!profiles.avatar_url, tab: "profile" },
    { key: "bio", done: typeof pro.bio === "string" && pro.bio.trim().length >= 30, tab: "profile" },
    { key: "services", done: hasLen(pro.services), tab: "services" },
    { key: "location", done: hasLocation, tab: "profile" },
    { key: "whatsapp", done: typeof pro.whatsapp === "string" && pro.whatsapp.trim().length > 0, tab: "profile" },
    { key: "verification", done: pro.verification_status === "verified", tab: "verificacion" },
  ];

  // Aseguradoras apply ONLY to health pros; for everyone else it doesn't exist,
  // so it's never counted as "missing".
  if (anyHealthCategory(professions)) {
    items.push({ key: "insurers", done: hasLen(pro.insurance_networks), tab: "profile" });
  }

  const done = items.filter((i) => i.done).length;
  const percent = Math.round((done / items.length) * 100);
  return { percent, items };
}

export function ProfileCompletion({ pro, onGo }: { pro: ProRecord; onGo: (tab: string) => void }) {
  const t = useTranslations("proPanel.completion");
  const { percent, items } = computeCompletion(pro);
  const missing = items.filter((i) => !i.done);
  const complete = percent === 100;

  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 mb-6">
      <div className="flex items-center gap-4">
        {/* Progress ring */}
        <div className="relative h-14 w-14 shrink-0">
          <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f3f4f6" strokeWidth="4" />
            <circle
              cx="18" cy="18" r="15.5" fill="none"
              stroke={complete ? "#16a34a" : "#009FD9"} strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${(percent / 100) * 97.4} 97.4`}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-sm font-bold text-[#111827]">{percent}%</span>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#111827] flex items-center gap-1.5">
            {complete ? (<><Sparkles className="h-4 w-4 text-[#16a34a]" /> {t("completeTitle")}</>) : t("title")}
          </h3>
          <p className="text-xs text-[#6b7280] mt-0.5">
            {complete ? t("completeSubtitle") : t("subtitle")}
          </p>
        </div>
      </div>

      {!complete && (
        <ul className="mt-4 flex flex-col gap-1.5">
          {missing.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onGo(item.tab)}
                className="group flex w-full items-start gap-2.5 rounded-xl border border-[#f3f4f6] hover:border-[#bfdbfe] hover:bg-[#f9fbff] px-3 py-2.5 text-left transition-colors"
              >
                <Circle className="h-4 w-4 text-[#cbd5e1] shrink-0 mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[#111827]">{t(item.key)}</span>
                  <span className="block text-xs text-[#6b7280] mt-0.5">{t(`${item.key}Benefit`)}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-[#9ca3af] group-hover:text-[#009FD9] shrink-0 mt-0.5 transition-colors" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Done items — compact, reassuring summary when partially complete. */}
      {!complete && items.some((i) => i.done) && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {items.filter((i) => i.done).map((i) => (
            <span key={i.key} className="inline-flex items-center gap-1 text-[11px] text-[#16a34a]">
              <CheckCircle2 className="h-3.5 w-3.5" /> {t(i.key)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
