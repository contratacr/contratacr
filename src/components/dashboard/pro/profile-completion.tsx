"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, ListChecks, X } from "lucide-react";
import { serviceSupportsProfessionalCredential } from "@/lib/professional-credentials";
import { countCases } from "@/lib/services";

type ProRecord = Record<string, unknown>;

export type CompletionItem = {
  key: string;
  done: boolean;
  tab: string;
  optional?: boolean;
};

function hasLen(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasText(value: unknown, min = 1): boolean {
  return typeof value === "string" && value.trim().length >= min;
}

function firstObject(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const first = value.find((item) => item && typeof item === "object");
    return (first ?? {}) as Record<string, unknown>;
  }
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function activeServices(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((service) => {
    if (!service || typeof service !== "object") return false;
    return (service as { active?: unknown }).active !== false;
  }) as Array<Record<string, unknown>>;
}

function socialLinks(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function hasAnyText(...values: unknown[]) {
  return values.some((value) => hasText(value));
}

export function computeCompletion(pro: ProRecord): {
  percent: number;
  items: CompletionItem[];
  verified: boolean;
} {
  const profiles = firstObject(pro.profiles);
  const hasProfilePhoto =
    hasText(profiles.avatar_url) ||
    (typeof pro.avatar_url === "string" && pro.avatar_url.trim().length > 0);
  // Completion must follow the editor's actual rule: a saved, non-empty
  // description is complete. Requiring a second hidden minimum here caused a
  // correctly saved description to keep reappearing in the checklist.
  const hasBio = [pro.bio, pro.description, profiles.bio, profiles.description]
    .some((value) => hasText(value));

  const hasLocation =
    hasLen(pro.workplaces) ||
    hasLen(pro.coverage_areas) ||
    hasLen(pro.coverage_provincias) ||
    !!pro.coverage_country ||
    !!pro.provincia_id ||
    !!pro.canton_id;
  const services = activeServices(pro.services);
  const hasSelectedServices = services.length > 0;
  const hasServiceDescription = services.some((service) => hasText(service.description));
  const hasServicePrice = services.some((service) =>
    service.priceType === "a_convenir" ||
    (typeof service.priceAmount === "number" && service.priceAmount > 0) ||
    hasText(service.price)
  );
  const hasServiceExperience = services.some((service) =>
    (typeof service.startedAt === "string" && /^\d{4}-\d{2}$/.test(service.startedAt)) ||
    (typeof service.years === "number" && service.years > 0) ||
    (typeof service.months === "number" && service.months > 0)
  );
  const links = socialLinks(pro.social_links);
  const hasPublicLinks = hasAnyText(links.website, links.instagram, links.facebook, links.tiktok, links.linkedin);
  const hasLanguages = Array.isArray(pro.languages) && pro.languages.some((language) => hasText(language));
  const hasEducation = hasLen(pro.certifications);
  const hasPortfolio =
    countCases(
      Array.isArray(pro.portfolio_items) ? pro.portfolio_items : null,
      Array.isArray(pro.portfolio_urls) ? pro.portfolio_urls : null
    ) > 0 || hasLen(pro.portfolio);
  const hasServiceImage = services.some((service) => hasText(service.imageUrl));
  const credentialServices = services.filter((service) => {
    const category = typeof service.category === "string" ? service.category : "";
    return serviceSupportsProfessionalCredential(category);
  });
  const hasServiceCredential = credentialServices.length > 0 && credentialServices.every((service) =>
    hasText(service.professionalCredentialNumber)
  );
  const hasVerification = pro.verification_status === "verified";
  const items: CompletionItem[] = [
    { key: "photo", done: hasProfilePhoto, tab: "profile" },
    { key: "bio", done: hasBio, tab: "profile" },
    { key: "services", done: hasSelectedServices, tab: "services" },
    { key: "serviceDescription", done: hasServiceDescription, tab: "services" },
    { key: "servicePrice", done: hasServicePrice, tab: "services" },
    { key: "serviceExperience", done: hasServiceExperience, tab: "services" },
    { key: "location", done: hasLocation, tab: "profile" },
    { key: "whatsapp", done: hasText(pro.whatsapp), tab: "profile" },
    { key: "languages", done: hasLanguages, tab: "profile", optional: true },
    { key: "publicLinks", done: hasPublicLinks, tab: "profile", optional: true },
    { key: "education", done: hasEducation, tab: "profile", optional: true },
    { key: "verification", done: hasVerification, tab: "profile", optional: true },
    { key: "serviceImage", done: hasServiceImage, tab: "services", optional: true },
    ...(credentialServices.length > 0
      ? [{ key: "serviceCredential", done: hasServiceCredential, tab: "services", optional: true }]
      : []),
    { key: "portfolio", done: hasPortfolio, tab: "photos", optional: true },
  ];

  const done = items.filter((item) => item.done).length;
  const percent = Math.round((done / items.length) * 100);
  return { percent, items, verified: pro.verification_status === "verified" };
}

export function ProfileCompletion({
  pro,
  onGo,
  variant = "header",
  onViewSteps,
  onComplete,
}: {
  pro: ProRecord;
  onGo: (tab: string, field?: string) => void;
  variant?: "header" | "summary" | "details";
  onViewSteps?: () => void;
  onComplete?: () => void;
}) {
  const t = useTranslations("proPanel.completion");
  const { percent, items } = computeCompletion(pro);
  const proId = typeof pro.id === "string" ? pro.id : "profile";
  const storageKey = `contratacr_completion_dismissed_${proId}`;
  const ignoredStorageKey = `contratacr_completion_ignored_${proId}`;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  const [ignored, setIgnored] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(ignoredStorageKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
    } catch {
      return [];
    }
  });

  const ignoredSet = new Set(ignored);
  const missing = items.filter((item) => !item.done && !ignoredSet.has(item.key));
  const optionalMissing = missing.filter((item) => item.optional);
  const ignoredCount = items.filter((item) => !item.done && ignoredSet.has(item.key)).length;
  const profileComplete = missing.length === 0;
  const checklistHidden = dismissed || missing.length === 0;

  useEffect(() => {
    if (profileComplete) onComplete?.();
  }, [profileComplete, onComplete]);

  if (profileComplete) return null;

  function showSteps() {
    setDismissed(false);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // The checklist still reopens for this render if storage is unavailable.
    }
  }

  function openSteps() {
    showSteps();
    onViewSteps?.();
  }

  if (variant === "header") {
    return (
      <button
        type="button"
        onClick={openSteps}
        className="mt-2 flex w-full max-w-[17.5rem] items-center gap-2 rounded-2xl border border-[#d8edf6] bg-[#f7fcff] px-3 py-2 text-left text-[11px] font-bold text-[#526277] shadow-[0_8px_20px_-18px_rgba(15,23,42,0.5)] transition hover:border-[#bfe6f4] hover:bg-[#effaff] hover:text-[#0089bb] sm:max-w-[22rem] sm:text-xs"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e8f8fd] text-[10px] font-extrabold tabular-nums text-[#009FD9]">
          {percent}%
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[#162543]">{t("title")}</span>
          <span className="mt-0.5 block truncate font-semibold text-[#64748b]">{t("stepsLeft", { count: missing.length })}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#8aa0b4]" />
      </button>
    );
  }

  if (variant === "summary") {
    return (
      <button
        type="button"
        onClick={openSteps}
        className="flex w-full items-center gap-2 rounded-2xl border border-[#d8edf6] bg-[#f7fcff] px-3 py-2.5 text-left shadow-[0_10px_24px_-22px_rgba(15,23,42,0.5)] transition hover:border-[#bfe6f4] hover:bg-[#effaff]"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e8f8fd] text-[10px] font-extrabold tabular-nums text-[#009FD9]">
          {percent}%
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-extrabold leading-tight text-[#162543]">{t("title")}</span>
          <span className="mt-0.5 block truncate text-[11px] font-semibold leading-tight text-[#64748b]">
            {t("stepsLeft", { count: missing.length })}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#8aa0b4]" />
      </button>
    );
  }
  if (checklistHidden) {
    return (
      <section className="mb-4 rounded-[18px] border border-[#dbe7ef] bg-white px-3.5 py-3 shadow-[0_10px_28px_-24px_rgba(15,23,42,0.55)] sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eef9fd] text-[#009FD9]">
            <ListChecks className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-[#111827]">{t("title")}</p>
            <p className="truncate text-xs font-semibold text-[#64748b]">{t("compactProgress", { percent })}</p>
          </div>
          <button
            type="button"
            onClick={openSteps}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#eef9fd] px-3 py-2 text-xs font-extrabold text-[#007eae] transition-colors hover:bg-[#dff4fb]"
          >
            {t("viewSteps")}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    );
  }

  const next = missing[0];
  const visibleSteps = missing;

  function ignoreItem(key: string) {
    setIgnored((current) => {
      if (current.includes(key)) return current;
      const nextIgnored = [...current, key];
      try {
        localStorage.setItem(ignoredStorageKey, JSON.stringify(nextIgnored));
      } catch {
        // Ignore storage failures; the card still updates for this render.
      }
      return nextIgnored;
    });
  }

  function ignoreAll() {
    const missingKeys = items.filter((item) => !item.done && item.optional).map((item) => item.key);
    const nextIgnored = Array.from(new Set([...ignored, ...missingKeys]));
    setIgnored(nextIgnored);
    try {
      localStorage.setItem(ignoredStorageKey, JSON.stringify(nextIgnored));
    } catch {
      // Ignore storage failures; the optional rows still hide for this render.
    }
  }

  return (
    <section className="w-full bg-white py-1">
      <div className="w-full">
        <button
          type="button"
          onClick={() => onGo(next.tab, next.key)}
          className="group block w-full rounded-xl px-1 py-1 text-left transition-colors hover:bg-[#f8fbfd] sm:px-2 sm:py-2"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[19px] font-extrabold leading-tight text-[#111827] sm:text-[21px]">
                {t("stepsLeft", { count: missing.length })}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#64748b]">
                {t("compactProgress", { percent })}
                {ignoredCount > 0 ? ` - ${t("ignoredCount", { count: ignoredCount })}` : ""}
              </p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#eef9fd] text-[12px] font-extrabold tabular-nums text-[#009FD9] sm:h-14 sm:w-14 sm:text-sm">
              {percent}%
            </span>
          </div>
          <span className="mt-4 block h-2 overflow-hidden rounded-full bg-[#edf4f8]">
            <span
              className="block h-full rounded-full bg-[#009FD9] transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </span>
        </button>

        <div className="mt-5 divide-y divide-[#e8eef3] border-y border-[#e8eef3]">
          {visibleSteps.map((item, index) => (
            <div
              key={item.key}
              className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 px-1 py-4 text-left transition-colors hover:bg-[#f8fbfd] sm:gap-3 sm:px-2"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#eef9fd] text-[12px] font-extrabold text-[#009FD9]">
                {index + 1}
              </span>
              <button
                type="button"
                onClick={() => onGo(item.tab, item.key)}
                className="min-w-0 text-left"
              >
                <span className="block text-[13px] font-extrabold leading-snug text-[#526277] group-hover:text-[#162543] sm:text-sm">
                  {t(item.key)}
                </span>
                {item.optional ? (
                  <span className="mt-1 inline-flex w-fit rounded-full bg-[#f1f6f9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.02em] text-[#7c8fa1]">
                    {t("optionalShort")}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => onGo(item.tab, item.key)}
                aria-label={t(item.key)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#94a3b8] transition-colors group-hover:text-[#009FD9]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {item.optional ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    ignoreItem(item.key);
                  }}
                  aria-label={t("ignoreStep")}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#94a3b8] transition-colors hover:bg-[#f1f6f9] hover:text-[#162543]"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <span className="h-8 w-8" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
        {optionalMissing.length > 0 && (
          <button
            type="button"
            onClick={ignoreAll}
            className="mt-3 inline-flex rounded-full bg-[#f1f6f9] px-3 py-2 text-xs font-bold text-[#526277] transition-colors hover:bg-[#e7f0f5] hover:text-[#162543]"
          >
            {t("ignoreOptional")}
          </button>
        )}
      </div>
    </section>
  );
}
