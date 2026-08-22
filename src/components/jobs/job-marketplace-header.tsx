"use client";

import { useState } from "react";
import { ScrollRail } from "@/components/ui/scroll-rail";
import { X } from "lucide-react";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { MarketplaceFilterChip, MarketplaceNavbarPortal, MarketplaceSearch } from "@/components/marketplace/marketplace-controls";
import { COMMON_JOB_TITLES, type EmploymentType, type ExperienceLevel, type WorkplaceType } from "@/lib/jobs";
import { employmentTypeLabel, experienceLevelLabel, marketplaceLocale, workplaceTypeLabel } from "@/lib/marketplace-copy";

const JOB_HEADER_COPY = {
  es: {
    placeholder: "¿Qué empleo estás buscando?",
    published: "Publicado",
    anyDate: "Cualquier fecha",
    lastDay: "Últimas 24 horas",
    lastWeek: "Última semana",
    lastMonth: "Último mes",
    workplace: "Modalidad",
    anyWorkplace: "Cualquier modalidad",
    experience: "Experiencia",
    anyExperience: "Cualquier experiencia",
    employment: "Tipo de empleo",
    anyEmployment: "Cualquier tipo",
    location: "Ubicación",
    clearLocation: "Limpiar ubicación",
    close: "Cerrar empleos",
    title: "Empleos",
  },
  en: {
    placeholder: "What job are you looking for?",
    published: "Date posted",
    anyDate: "Any date",
    lastDay: "Past 24 hours",
    lastWeek: "Past week",
    lastMonth: "Past month",
    workplace: "Workplace",
    anyWorkplace: "Any workplace",
    experience: "Experience",
    anyExperience: "Any experience",
    employment: "Employment type",
    anyEmployment: "Any type",
    location: "Location",
    clearLocation: "Clear location",
    close: "Close jobs",
    title: "Jobs",
  },
} as const;

type JobMarketplaceHeaderProps = {
  initialQuery?: string;
  initialLocation?: string;
  suggestions?: string[];
};

function buildJobsUrl({ query, location, published, workplace, experience, employment }: { query: string; location: string; published: string; workplace: string; experience: string; employment: string }) {
  const params = new URLSearchParams();
  const cleanQuery = query.trim();
  if (cleanQuery) params.set("q", cleanQuery);
  const cleanLocation = location.trim();
  if (cleanLocation) params.set("location", cleanLocation);
  if (published !== "all") params.set("published", published);
  if (workplace !== "all") params.set("workplace", workplace);
  if (experience !== "all") params.set("experience", experience);
  if (employment !== "all") params.set("employment", employment);
  return `/empleos${params.toString() ? `?${params.toString()}` : ""}`;
}

export function JobMarketplaceHeader({ initialQuery = "", initialLocation = "", suggestions = [] }: JobMarketplaceHeaderProps) {
  const router = useRouter();
  const locale = marketplaceLocale(useLocale());
  const copy = JOB_HEADER_COPY[locale];
  const [query, setQuery] = useState(initialQuery);
  const [location, setLocation] = useState(initialLocation);
  const [published, setPublished] = useState("all");
  const [workplace, setWorkplace] = useState("all");
  const [experience, setExperience] = useState("all");
  const [employment, setEmployment] = useState("all");
  const mergedSuggestions = [...new Set([...suggestions, ...(locale === "es" ? COMMON_JOB_TITLES : [])])];

  function go(next: Partial<{ query: string; location: string; published: string; workplace: string; experience: string; employment: string }>) {
    const values = {
      query: next.query ?? query,
      location: next.location ?? location,
      published: next.published ?? published,
      workplace: next.workplace ?? workplace,
      experience: next.experience ?? experience,
      employment: next.employment ?? employment,
    };
    router.push(buildJobsUrl(values));
  }

  const search = (
    <MarketplaceSearch
      value={query}
      onChange={setQuery}
      onSubmit={() => go({ query, location })}
      placeholder={copy.placeholder}
      suggestions={mergedSuggestions}
      recentStorageKey="ccr-job-search-recents"
      secondary={{
        value: location,
        onChange: setLocation,
        placeholder: copy.location,
        ariaLabel: copy.location,
        icon: "location",
        clearLabel: copy.clearLocation,
      }}
    />
  );
  const filters = (
    <>
      <MarketplaceFilterChip label={copy.published} value={published} onChange={(value) => { setPublished(value); go({ published: value }); }} options={[["all", copy.anyDate], ["1", copy.lastDay], ["7", copy.lastWeek], ["30", copy.lastMonth]]} />
      <MarketplaceFilterChip label={copy.workplace} value={workplace} onChange={(value) => { setWorkplace(value); go({ workplace: value }); }} options={[["all", copy.anyWorkplace], ...(["onsite", "hybrid", "remote"] as WorkplaceType[]).map((value) => [value, workplaceTypeLabel(value, locale)] as [string, string])]} />
      <MarketplaceFilterChip label={copy.experience} value={experience} onChange={(value) => { setExperience(value); go({ experience: value }); }} options={[["all", copy.anyExperience], ...(["any", "one_plus", "two_plus", "three_plus", "five_plus"] as ExperienceLevel[]).map((value) => [value, experienceLevelLabel(value, locale)] as [string, string])]} />
      <MarketplaceFilterChip label={copy.employment} value={employment} onChange={(value) => { setEmployment(value); go({ employment: value }); }} options={[["all", copy.anyEmployment], ...(["full_time", "part_time", "contract", "temporary", "internship"] as EmploymentType[]).map((value) => [value, employmentTypeLabel(value, locale)] as [string, string])]} />
    </>
  );

  return (
    <>
      <section className="sticky top-0 z-20 border-b border-[#d5d8dc] bg-white lg:hidden">
        <div className="relative flex min-h-[56px] items-center justify-center px-14">
          <Link href="/empleos" aria-label={copy.close} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-[#162543] transition hover:bg-[#eef5f9]">
            <X className="h-7 w-7" strokeWidth={2.2} />
          </Link>
          <h1 className="truncate text-center text-[21px] font-extrabold text-[#162543]">{copy.title}</h1>
        </div>
        <div className="px-4 pb-3">{search}</div>
        <ScrollRail className="flex gap-1.5 px-4 pb-4">{filters}</ScrollRail>
      </section>
      <MarketplaceNavbarPortal>
        <section className="hidden h-full bg-transparent lg:block">
          <div className="flex h-full w-full items-center py-2">
            <div className="w-full">{search}</div>
          </div>
        </section>
      </MarketplaceNavbarPortal>
      <section className="hidden border-b border-[#dfe8f0] bg-[#f4f7fa] lg:block">
        <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-6 py-3">
          {filters}
        </div>
      </section>
    </>
  );
}
