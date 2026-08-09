"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { MarketplaceFilterChip, MarketplaceNavbarPortal, MarketplaceSearch } from "@/components/marketplace/marketplace-controls";
import { COMMON_JOB_TITLES, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, WORKPLACE_TYPES } from "@/lib/jobs";

type JobMarketplaceHeaderProps = {
  initialQuery?: string;
  suggestions?: string[];
};

function buildJobsUrl({ query, published, workplace, experience, employment }: { query: string; published: string; workplace: string; experience: string; employment: string }) {
  const params = new URLSearchParams();
  const cleanQuery = query.trim();
  if (cleanQuery) params.set("q", cleanQuery);
  if (published !== "all") params.set("published", published);
  if (workplace !== "all") params.set("workplace", workplace);
  if (experience !== "all") params.set("experience", experience);
  if (employment !== "all") params.set("employment", employment);
  return `/empleos${params.toString() ? `?${params.toString()}` : ""}`;
}

export function JobMarketplaceHeader({ initialQuery = "", suggestions = [] }: JobMarketplaceHeaderProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [published, setPublished] = useState("all");
  const [workplace, setWorkplace] = useState("all");
  const [experience, setExperience] = useState("all");
  const [employment, setEmployment] = useState("all");
  const mergedSuggestions = [...new Set([...suggestions, ...COMMON_JOB_TITLES])];

  function go(next: Partial<{ query: string; published: string; workplace: string; experience: string; employment: string }>) {
    const values = {
      query: next.query ?? query,
      published: next.published ?? published,
      workplace: next.workplace ?? workplace,
      experience: next.experience ?? experience,
      employment: next.employment ?? employment,
    };
    router.push(buildJobsUrl(values));
  }

  const search = <MarketplaceSearch value={query} onChange={setQuery} onSubmit={() => go({ query })} placeholder="¿Qué empleo estás buscando?" suggestions={mergedSuggestions} recentStorageKey="ccr-job-search-recents" />;
  const filters = (
    <>
      <MarketplaceFilterChip label="Publicado" value={published} onChange={(value) => { setPublished(value); go({ published: value }); }} options={[["all", "Cualquier fecha"], ["1", "Últimas 24 horas"], ["7", "Última semana"], ["30", "Último mes"]]} />
      <MarketplaceFilterChip label="Modalidad" value={workplace} onChange={(value) => { setWorkplace(value); go({ workplace: value }); }} options={[["all", "Cualquier modalidad"], ...Object.entries(WORKPLACE_TYPES)]} />
      <MarketplaceFilterChip label="Experiencia" value={experience} onChange={(value) => { setExperience(value); go({ experience: value }); }} options={[["all", "Cualquier experiencia"], ...Object.entries(EXPERIENCE_LEVELS)]} />
      <MarketplaceFilterChip label="Tipo de empleo" value={employment} onChange={(value) => { setEmployment(value); go({ employment: value }); }} options={[["all", "Cualquier tipo"], ...Object.entries(EMPLOYMENT_TYPES)]} />
    </>
  );

  return (
    <>
      <section className="sticky top-0 z-20 border-b border-[#d5d8dc] bg-white lg:hidden">
        <div className="relative flex min-h-[56px] items-center justify-center px-14">
          <Link href="/empleos" aria-label="Cerrar empleo" className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-[#162543] transition hover:bg-[#eef5f9]">
            <X className="h-7 w-7" strokeWidth={2.2} />
          </Link>
          <h1 className="truncate text-center text-[21px] font-extrabold text-[#162543]">Empleos</h1>
        </div>
        <div className="px-4 pb-3">{search}</div>
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pb-4">{filters}</div>
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
