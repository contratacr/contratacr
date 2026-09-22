"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useHairlineOnScroll } from "@/components/util/use-hairline-on-scroll";
import { ScrollRail } from "@/components/ui/scroll-rail";
import { X } from "lucide-react";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { MarketplaceClearFilters, MarketplaceFilterChip, MarketplaceNavbarPortal, MarketplaceSearch } from "@/components/marketplace/marketplace-controls";
import { COMMON_JOB_TITLES, type EmploymentType, type ExperienceLevel, type WorkplaceType } from "@/lib/jobs";
import { employmentTypeLabel, experienceLevelLabel, marketplaceLocale, workplaceTypeLabel } from "@/lib/marketplace-copy";
import { CABECERA_BOTON, CABECERA_FILA_CENTRADA, CABECERA_GLIFO, CABECERA_TITULO } from "@/components/layout/cabecera";

const JOB_HEADER_COPY = {
  es: {
    placeholder: "¿Qué empleo buscas?",
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
    placeholder: "Search jobs",
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
  const { cabeceraRef, conLinea } = useHairlineOnScroll();
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
      visitSurface="empleos"
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
      <MarketplaceClearFilters
        activos={[published, workplace, experience, employment].filter((value) => value !== "all").length}
        onClear={() => {
          setPublished("all");
          setWorkplace("all");
          setExperience("all");
          setEmployment("all");
          go({ published: "all", workplace: "all", experience: "all", employment: "all" });
        }}
      />
    </>
  );

  return (
    <>
      <section ref={cabeceraRef} className={cn("ccr-cabecera-pegada sticky top-0 z-20 border-b bg-white transition-colors duration-200 lg:hidden", conLinea ? "border-[#e5e7eb]" : "border-transparent")}>
        <div className={CABECERA_FILA_CENTRADA}>
          <Link href="/empleos" aria-label={copy.close} className={cn("absolute left-4 top-1/2 -translate-y-1/2", CABECERA_BOTON)}>
            <X className={CABECERA_GLIFO} strokeWidth={2.4} />
          </Link>
          <h1 className={cn(CABECERA_TITULO, "text-center")}>{copy.title}</h1>
        </div>
        <div className="px-4 pb-3">{search}</div>
        <ScrollRail className="flex gap-1 px-4 pb-4 sm:gap-1.5">{filters}</ScrollRail>
      </section>
      <MarketplaceNavbarPortal>
        <section className="hidden h-full bg-transparent lg:block">
          <div className="flex h-full w-full items-center py-2">
            <div className="w-full">{search}</div>
          </div>
        </section>
      </MarketplaceNavbarPortal>
      <section className="hidden border-b border-[#e5e7eb] bg-[#f4f7fa] lg:block">
        <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-6 py-3">
          {filters}
        </div>
      </section>
    </>
  );
}
