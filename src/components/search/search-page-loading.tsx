"use client";

import { useLocale, useTranslations } from "next-intl";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { SearchResultsLayout } from "@/components/search/search-results-layout";
import { Skeleton } from "@/components/ui/content-loading";

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

function FiltersSkeleton() {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
      <Skeleton className="h-5 w-24 rounded-md" />
      <div className="mt-5 space-y-4">
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}

function ProfessionalCardSkeleton() {
  return (
    <div className="w-full max-w-[520px] rounded-2xl border border-[#e5e7eb] bg-white p-4 lg:max-w-none lg:p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-44 max-w-[75%] rounded-md" />
          <Skeleton className="mt-2 h-4 w-24 rounded-full" />
          <Skeleton className="mt-2 h-3.5 w-36 rounded-md" />
        </div>
        <Skeleton className="h-5 w-20 rounded-md" />
      </div>
      <Skeleton className="mt-5 h-4 w-48 rounded-md" />
      <Skeleton className="mt-3 h-3.5 w-32 rounded-md" />
      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[#eef2f6] pt-4">
        {[0, 1, 2].map((column) => (
          <div key={column} className="space-y-2">
            <Skeleton className="mx-auto h-3.5 w-14 rounded-md" />
            <Skeleton className="h-7 w-full rounded-lg" />
            <Skeleton className="h-7 w-full rounded-lg" />
            <Skeleton className="h-7 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-4 h-11 w-full rounded-xl" />
    </div>
  );
}

export function SearchPageLoading() {
  const locale = useLocale();
  const t = useTranslations("search");
  const loadingLabel = locale === "en" ? "Loading professionals" : "Cargando profesionales";

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <LandingNavbar forceCompactSearch />
      <div className="h-16" aria-hidden />

      <div className="hidden bg-[#f4f7fa] lg:block">
        <div className="mx-auto max-w-[1920px] px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 h-6 w-1.5 shrink-0 rounded-full bg-[#009FD9]" aria-hidden />
            <div className="min-w-0">
              <Skeleton className="h-6 w-48 rounded-md" />
              <Skeleton className="mt-2 h-4 w-64 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1" aria-busy="true" aria-label={loadingLabel}>
        <div className="mx-auto max-w-[1920px] px-0 py-0 lg:px-8 lg:py-4">
          <SearchResultsLayout
            mapData={[]}
            apiKey={MAPS_API_KEY}
            locale={locale}
            countLabel={loadingLabel}
            filters={<FiltersSkeleton />}
            drawerFilters={<FiltersSkeleton />}
          >
            <div className="flex min-w-0 flex-col gap-3">
              <ProfessionalCardSkeleton />
              <ProfessionalCardSkeleton />
              <ProfessionalCardSkeleton />
            </div>
          </SearchResultsLayout>
        </div>
      </main>

      <div className="hidden lg:block">
        <LandingFooter />
      </div>
      <span className="sr-only">{t("title.default")}</span>
    </div>
  );
}
