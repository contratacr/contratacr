"use client";

import { LandingNavbar } from "@/components/landing/landing-navbar";
import { Navbar } from "@/components/layout/navbar";
import { GoogleMapPanel } from "@/components/maps/google-map-panel";
import { useNativeApp } from "@/hooks/use-native-app";
import { useLocale } from "next-intl";
import { BrandLoadingMark, Skeleton } from "@/components/ui/content-loading";
import { Loader2 } from "lucide-react";

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

function DashboardLoadingNotice({ locale }: { locale: string }) {
  const isEnglish = locale === "en";
  return (
    <div className="ccr-delayed-loading flex min-h-[45vh] flex-col items-center justify-center gap-3 text-center" aria-busy="true" role="status">
      <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" />
      <span className="sr-only">
        {isEnglish ? "Loading your panel..." : "Cargando tu panel..."}
      </span>
    </div>
  );
}

export function SearchRouteLoading() {
  const locale = useLocale();
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  return (
    <div className="min-h-screen bg-[#f4f7fa]" aria-busy="true">
      <LandingNavbar forceCompactSearch />
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
            <FilterSkeleton />
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
  const locale = useLocale();
  const nativeApp = useNativeApp();
  if (nativeApp) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f4f7fa]" aria-busy="true">
        <BrandLoadingMark className="min-h-0">
          <span className="sr-only">
            {locale === "en" ? "Loading your panel..." : "Cargando tu panel..."}
          </span>
        </BrandLoadingMark>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7fa]" aria-busy="true">
      <Navbar />
      <main>
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-6 lg:px-8">
          <DashboardLoadingNotice locale={locale} />
        </div>
      </main>
    </div>
  );
}
