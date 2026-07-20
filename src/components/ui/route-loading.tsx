"use client";

import { LandingNavbar } from "@/components/landing/landing-navbar";
import { Navbar } from "@/components/layout/navbar";
import { GoogleMapPanel } from "@/components/maps/google-map-panel";
import { useNativeApp } from "@/hooks/use-native-app";
import { useLocale } from "next-intl";
import { Skeleton } from "@/components/ui/content-loading";
import { Loader2, SlidersHorizontal } from "lucide-react";

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

function SearchCardSkeleton({ index }: { index: number }) {
  return (
    <div className="ccr-delayed-loading rounded-2xl border border-[#e2e8ee] bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <span className="absolute -left-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-[#162543] text-xs font-extrabold text-white">{index}</span>
          <Skeleton className="h-14 w-14 rounded-full" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-36 rounded-md" />
              <Skeleton className="h-4 w-24 rounded-md" />
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
            <Skeleton className="h-10 w-20 rounded-md" />
          </div>
          <div className="pt-3">
            <Skeleton className="h-4 w-44 rounded-md" />
            <Skeleton className="mt-2 h-px w-full rounded-full" />
            <Skeleton className="mt-2 h-4 w-32 rounded-md" />
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((day) => (
          <div key={day} className="space-y-2">
            <Skeleton className="mx-auto h-3 w-14 rounded-md" />
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-4 h-12 w-full rounded-full" />
    </div>
  );
}

function DashboardLoadingNotice({ locale, title, description }: { locale: string; title?: string; description?: string }) {
  const isEnglish = locale === "en";
  const fallbackTitle = isEnglish ? "Loading your panel" : "Cargando panel";
  return (
    <div className="ccr-delayed-loading flex min-h-[45vh] flex-col items-center justify-center gap-3 px-6 text-center" aria-busy="true" role="status">
      <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" />
      <div>
        <p className="text-sm font-extrabold text-[#162543]">{title ?? fallbackTitle}</p>
        {description && <p className="mt-1 text-xs font-medium text-[#6b7280]">{description}</p>}
      </div>
    </div>
  );
}

export function SearchRouteLoading() {
  const locale = useLocale();
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const isEnglish = locale === "en";
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
            <div className="relative h-full min-h-[420px] overflow-hidden bg-[#eef2f6] lg:min-h-[560px] lg:rounded-2xl lg:border lg:border-[#e5e7eb]">
              <GoogleMapPanel apiKey={mapsApiKey} professionals={[]} locale={locale} />
              <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
                <span className="inline-flex h-11 items-center gap-2 rounded bg-white px-3 text-sm font-extrabold text-[#162543] shadow-[0_4px_14px_rgba(15,23,42,0.12)]">
                  <SlidersHorizontal className="h-4 w-4 text-[#009FD9]" />
                  {isEnglish ? "Filters" : "Filtros"}
                </span>
              </div>
              <div className="pointer-events-none absolute right-3 top-3 flex overflow-hidden rounded bg-white shadow-[0_4px_14px_rgba(15,23,42,0.12)]">
                <span className="grid h-11 w-11 place-items-center border-r border-[#e5e7eb] text-xl font-medium text-[#162543]">-</span>
                <span className="grid h-11 w-11 place-items-center text-xl font-medium text-[#162543]">+</span>
              </div>
            </div>
          </section>

          <section className="absolute inset-x-0 bottom-0 z-10 rounded-t-[20px] border-x border-t border-[#e2e8ee] bg-white px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_36px_-14px_rgba(15,23,42,0.28)] lg:static lg:order-2 lg:w-[640px] lg:shrink-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none xl:w-[700px] 2xl:w-[820px]">
            <div className="mb-3 lg:hidden">
              <span className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-[#d1d5db]" />
              <p className="text-sm font-extrabold text-[#162543]">{isEnglish ? "Loading professionals" : "Cargando profesionales"}</p>
            </div>
            <div className="space-y-3">
              <div className="hidden lg:block">
                <Skeleton className="mb-3 h-5 w-56 rounded-md" />
              </div>
              <SearchCardSkeleton index={1} />
              <SearchCardSkeleton index={2} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export function DashboardRouteLoading({ title, description }: { title?: string; description?: string } = {}) {
  const locale = useLocale();
  const nativeApp = useNativeApp();
  if (nativeApp) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f4f7fa]" aria-busy="true">
        <DashboardLoadingNotice locale={locale} title={title} description={description} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7fa]" aria-busy="true">
      <Navbar />
      <main>
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-6 lg:px-8">
          <DashboardLoadingNotice locale={locale} title={title} description={description} />
        </div>
      </main>
    </div>
  );
}
