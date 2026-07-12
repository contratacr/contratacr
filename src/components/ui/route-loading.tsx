"use client";

import { Suspense } from "react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { Navbar } from "@/components/layout/navbar";
import { MobileServiceSearch, SearchFilters } from "@/components/search/search-filters";
import { GoogleMapPanel } from "@/components/maps/google-map-panel";
import { useLocale } from "next-intl";
import { PanelSectionLoading, Skeleton } from "@/components/ui/content-loading";

function FilterSkeleton() {
  return (
    <div className="rounded-2xl border border-[#e2e8ee] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex items-center justify-between">
        <Skeleton className="h-5 w-20 rounded-md" />
        <Skeleton className="h-4 w-12 rounded-md" />
      </div>
      <div className="space-y-5">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="space-y-2">
            <Skeleton className="h-3 w-20 rounded-md" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchResultsLoadingNotice({ locale }: { locale: string }) {
  const isEnglish = locale === "en";
  return (
    <div className="ccr-delayed-loading rounded-2xl border border-[#d9edf7] bg-white px-4 py-4 shadow-[0_2px_10px_rgba(15,23,42,0.05)] sm:px-5">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eaf7fc]">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#009FD9] motion-reduce:animate-none" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#162543]">
            {isEnglish ? "Finding professionals" : "Buscando profesionales"}
          </p>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            {isEnglish ? "Loading the results for this search." : "Estamos cargando los resultados para esta busqueda."}
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-2.5 w-11/12 rounded-full" />
        <Skeleton className="h-2.5 w-8/12 rounded-full" />
      </div>
    </div>
  );
}

export function SearchRouteLoading() {
  const locale = useLocale();
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  return (
    <div className="min-h-screen bg-[#f4f7fa]" aria-busy="true">
      <LandingNavbar mobileInline={<Suspense fallback={null}><MobileServiceSearch /></Suspense>} />
      <div className="h-16" aria-hidden />

      <div className="hidden lg:block">
        <div className="mx-auto max-w-[1920px] px-8 py-4">
          <div className="flex items-start gap-2.5">
            <span className="h-11 w-1.5 rounded-full bg-[#009FD9]/45" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-44 rounded-md" />
              <Skeleton className="h-3 w-32 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      <main className="relative h-[calc(100dvh-64px)] overflow-hidden lg:h-auto lg:px-8 lg:pb-5">
        <div className="absolute inset-0 lg:static lg:mx-auto lg:flex lg:max-w-[1920px] lg:gap-5">
          <aside className="hidden w-64 shrink-0 xl:block">
            <Suspense fallback={<FilterSkeleton />}><SearchFilters /></Suspense>
          </aside>

          <section className="absolute inset-0 lg:static lg:order-3 lg:min-w-0 lg:flex-1">
            <div className="h-full min-h-[420px] overflow-hidden bg-[#eef2f6] lg:min-h-[560px] lg:rounded-2xl lg:border lg:border-[#e5e7eb]">
              <GoogleMapPanel apiKey={mapsApiKey} professionals={[]} locale={locale} />
            </div>
          </section>

          <section className="absolute inset-x-0 bottom-0 z-10 rounded-t-[20px] border-x border-t border-[#e2e8ee] bg-white px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_36px_-14px_rgba(15,23,42,0.28)] lg:static lg:order-2 lg:w-[640px] lg:shrink-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none xl:w-[700px] 2xl:w-[820px]">
            <div className="mb-3 lg:hidden">
              <span className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-[#d1d5db]" />
              <Skeleton className="h-3 w-44 rounded-md" />
            </div>
            <SearchResultsLoadingNotice locale={locale} />
          </section>
        </div>
      </main>
    </div>
  );
}

export function DashboardRouteLoading() {
  return (
    <div className="min-h-screen bg-[#fafafa]" aria-busy="true">
      <Navbar />
      <main>
        <div className="mx-auto max-w-5xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-8 sm:px-6 lg:px-8 lg:pb-8">
          <div className="mb-6 flex items-center gap-4 border-b border-[#e5e7eb] pb-5">
            <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-28 rounded-md" />
              <Skeleton className="h-6 w-56 max-w-[70%] rounded-md" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>

          <div className="flex gap-6">
            <aside className="hidden w-60 shrink-0 lg:block">
              <div className="space-y-2 rounded-2xl border border-[#e5e7eb] bg-white p-2 shadow-sm">
                {[0, 1, 2, 3, 4, 5, 6].map((item) => (
                  <div key={item} className="flex h-10 items-center gap-3 px-3">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className={`h-3 rounded-md ${item % 2 ? "w-28" : "w-32"}`} />
                  </div>
                ))}
              </div>
            </aside>

            <section className="min-w-0 flex-1 rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-5 space-y-2">
                <Skeleton className="h-5 w-44 rounded-md" />
                <Skeleton className="h-3 w-64 max-w-full rounded-md" />
              </div>
              <PanelSectionLoading />
            </section>
          </div>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 flex h-[72px] items-center justify-around border-t border-[#e5e7eb] bg-white px-3 lg:hidden">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="flex w-16 flex-col items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-2.5 w-12 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
