import { Suspense } from "react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { Navbar } from "@/components/layout/navbar";
import { MobileServiceSearch } from "@/components/search/search-filters";
import { PanelSectionLoading, Skeleton } from "@/components/ui/content-loading";

function SearchCardSkeleton() {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[#e2e8ee] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.06)] sm:p-5">
      <div className="grid min-h-[190px] gap-5 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2 pt-0.5">
              <Skeleton className="h-4 w-3/5 rounded-md" />
              <Skeleton className="h-3 w-2/5 rounded-md" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-7 w-20 shrink-0 rounded-md" />
          </div>
          <div className="mt-4 space-y-2.5">
            <Skeleton className="h-3 w-11/12 rounded-md" />
            <Skeleton className="h-3 w-3/4 rounded-md" />
          </div>
          <div className="mt-5 flex gap-2">
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>

        <div className="hidden border-l border-[#edf1f4] pl-5 lg:block">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[0, 1, 2].map((day) => (
              <div key={day} className="space-y-2">
                <Skeleton className="mx-auto h-3 w-12 rounded-md" />
                <Skeleton className="h-7 w-full rounded-md" />
                <Skeleton className="h-7 w-full rounded-md" />
                <Skeleton className="h-7 w-full rounded-md" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-4 h-9 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

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

function MapSkeleton() {
  return (
    <div className="relative h-full min-h-[420px] overflow-hidden bg-[#e6f2ec] lg:min-h-[560px] lg:rounded-2xl lg:border lg:border-[#d9e5df]">
      <span className="absolute left-[18%] top-0 h-full w-3 rotate-[18deg] bg-white/70" />
      <span className="absolute left-0 top-[42%] h-3 w-full -rotate-[5deg] bg-white/75" />
      <span className="absolute right-[22%] top-0 h-full w-2 -rotate-[12deg] bg-white/55" />
      <Skeleton className="absolute left-4 top-4 h-10 w-28 rounded-full bg-white/90" />
      <Skeleton className="absolute right-4 top-4 h-10 w-10 rounded-lg bg-white/90" />
    </div>
  );
}

export function SearchRouteLoading() {
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
          <aside className="hidden w-64 shrink-0 xl:block"><FilterSkeleton /></aside>

          <section className="absolute inset-0 lg:static lg:order-3 lg:min-w-0 lg:flex-1">
            <MapSkeleton />
          </section>

          <section className="absolute inset-x-0 bottom-0 z-10 h-[34dvh] rounded-t-[20px] border-x border-t border-[#e2e8ee] bg-white px-4 pb-6 pt-3 shadow-[0_-12px_36px_-14px_rgba(15,23,42,0.28)] lg:static lg:order-2 lg:h-auto lg:w-[640px] lg:shrink-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none xl:w-[700px] 2xl:w-[820px]">
            <div className="mb-3 lg:hidden">
              <span className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-[#d1d5db]" />
              <Skeleton className="h-3 w-44 rounded-md" />
            </div>
            <div className="space-y-3">
              {[0, 1, 2].map((item) => <SearchCardSkeleton key={item} />)}
            </div>
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
