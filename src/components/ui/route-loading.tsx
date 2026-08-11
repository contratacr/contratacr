"use client";

import { Navbar } from "@/components/layout/navbar";
import { Skeleton } from "@/components/ui/content-loading";
import { useNativeApp } from "@/hooks/use-native-app";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

function DashboardLoadingNotice({ title, description }: { title?: string; description?: string }) {
  const t = useTranslations("loading");
  return (
    <div className="ccr-delayed-loading flex min-h-[45vh] flex-col items-center justify-center gap-3 px-6 text-center" aria-busy="true" role="status">
      <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" />
      <div>
        <p className="text-sm font-extrabold text-[#162543]">{title ?? t("panel")}</p>
        {description && <p className="mt-1 text-xs font-medium text-[#6b7280]">{description}</p>}
      </div>
    </div>
  );
}

export function DashboardRouteLoading({ title, description }: { title?: string; description?: string } = {}) {
  const nativeApp = useNativeApp();
  if (nativeApp) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f4f7fa]" aria-busy="true">
        <DashboardLoadingNotice title={title} description={description} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7fa]" aria-busy="true">
      <Navbar />
      <main>
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-6 lg:px-8">
          <DashboardLoadingNotice title={title} description={description} />
        </div>
      </main>
    </div>
  );
}

function MarketplaceListRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-[#e4ebf1]">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex min-h-[112px] gap-3 px-4 py-4 sm:px-5">
          <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4 rounded-full" />
            <Skeleton className="h-3 w-1/2 rounded-full" />
            <Skeleton className="h-3 w-5/6 rounded-full" />
            <Skeleton className="h-3 w-2/5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MarketplaceRouteLoading() {
  const t = useTranslations("loading");
  return (
    <div className="min-h-screen bg-white text-[#162543] lg:bg-[#f4f7fa]" aria-busy="true" role="status">
      <Navbar />
      <span className="sr-only">{t("generic")}</span>
      <main className="ccr-delayed-loading mx-auto w-full max-w-[1240px] pb-12 lg:px-6 lg:pt-5">
        <div className="hidden items-end justify-between gap-4 lg:flex">
          <div className="space-y-2">
            <Skeleton className="h-7 w-32 rounded-full" />
            <Skeleton className="h-3 w-48 rounded-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28 rounded-xl" />
            <Skeleton className="h-10 w-36 rounded-xl" />
          </div>
        </div>

        <div className="flex gap-2 overflow-hidden px-4 py-3 lg:px-0">
          <Skeleton className="h-9 w-28 shrink-0 rounded-xl" />
          <Skeleton className="h-9 w-28 shrink-0 rounded-xl" />
          <Skeleton className="h-9 w-28 shrink-0 rounded-xl" />
          <Skeleton className="h-9 w-32 shrink-0 rounded-xl" />
        </div>

        <div className="overflow-hidden border-y border-[#dfe8f0] bg-white lg:grid lg:min-h-[560px] lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)] lg:rounded-lg lg:border">
          <div className="min-w-0 lg:border-r lg:border-[#dfe8f0]">
            <div className="space-y-2 border-b border-[#e4ebf1] px-4 py-4">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-3 w-20 rounded-full" />
            </div>
            <MarketplaceListRows />
          </div>

          <div className="hidden min-w-0 p-7 lg:block">
            <div className="flex gap-4">
              <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2.5">
                <Skeleton className="h-6 w-3/5 rounded-full" />
                <Skeleton className="h-4 w-2/5 rounded-full" />
                <Skeleton className="h-3 w-1/2 rounded-full" />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <Skeleton className="h-11 w-32 rounded-xl" />
              <Skeleton className="h-11 w-36 rounded-xl" />
            </div>
            <div className="mt-7 grid grid-cols-2 gap-x-10 gap-y-5 border-y border-[#e4ebf1] py-6">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-3 w-24 rounded-full" />
                  <Skeleton className="h-4 w-36 rounded-full" />
                </div>
              ))}
            </div>
            <div className="mt-7 space-y-4">
              <Skeleton className="h-5 w-36 rounded-full" />
              <Skeleton className="h-3 w-full rounded-full" />
              <Skeleton className="h-3 w-11/12 rounded-full" />
              <Skeleton className="h-3 w-4/5 rounded-full" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export function SearchRouteLoading() {
  const t = useTranslations("loading");
  return (
    <div className="min-h-screen bg-[#f4f7fa] text-[#162543]" aria-busy="true" role="status">
      <Navbar />
      <span className="sr-only">{t("generic")}</span>
      <main className="ccr-delayed-loading mx-auto grid min-h-[calc(100vh-72px)] w-full max-w-[1480px] lg:grid-cols-[minmax(520px,1fr)_minmax(360px,42%)]">
        <div className="relative h-[42vh] overflow-hidden bg-[#e8f2f3] lg:order-2 lg:h-[calc(100vh-72px)]">
          <Skeleton className="absolute inset-0 rounded-none" />
          <Skeleton className="absolute left-1/2 top-5 h-10 w-44 -translate-x-1/2 rounded-full" />
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            <Skeleton className="h-10 w-36 rounded-full" />
            <Skeleton className="h-10 w-28 rounded-full" />
          </div>
        </div>

        <section className="relative -mt-4 overflow-hidden rounded-t-[22px] border-t border-[#dfe8f0] bg-white lg:order-1 lg:mt-0 lg:rounded-none lg:border-r lg:border-t-0">
          <div className="flex justify-center py-3 lg:hidden">
            <span className="h-1 w-10 rounded-full bg-[#c9d3dd]" />
          </div>
          <div className="space-y-2 border-b border-[#e4ebf1] px-4 pb-4 lg:px-6 lg:pt-5">
            <Skeleton className="h-5 w-44 rounded-full" />
            <Skeleton className="h-3 w-32 rounded-full" />
          </div>
          <div className="p-4 lg:p-5">
            <MarketplaceListRows rows={4} />
          </div>
        </section>
      </main>
    </div>
  );
}
