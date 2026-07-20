import { LandingNavbar } from "@/components/landing/landing-navbar";

export default function SearchRouteLoading() {
  return (
    <div className="min-h-screen bg-[#f4f7fa]">
      <LandingNavbar forceCompactSearch />
      <div className="h-16" aria-hidden />
      <main className="relative min-h-[calc(100dvh-4rem)] overflow-hidden" aria-label="Cargando profesionales">
        <div className="h-[38dvh] min-h-56 bg-[#dff3ef] lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[45%]" />
        <section className="relative -mt-5 rounded-t-[22px] border border-[#e2e8ee] bg-[#f4f7fa] px-4 pb-8 pt-5 lg:mr-[45%] lg:mt-0 lg:min-h-[calc(100dvh-4rem)] lg:rounded-none lg:border-0 lg:px-6">
          <div className="ccr-skeleton-shimmer mb-5 h-5 w-56 rounded-md" />
          <div className="space-y-4">
            {[0, 1].map((item) => (
              <div key={item} className="h-48 rounded-2xl border border-[#e2e8ee] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
                <div className="flex gap-3">
                  <div className="ccr-skeleton-shimmer h-14 w-14 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="ccr-skeleton-shimmer h-4 w-2/3 rounded-md" />
                    <div className="ccr-skeleton-shimmer h-3 w-1/2 rounded-md" />
                    <div className="ccr-skeleton-shimmer h-3 w-1/3 rounded-md" />
                  </div>
                </div>
                <div className="ccr-skeleton-shimmer mt-6 h-4 w-2/5 rounded-md" />
                <div className="ccr-skeleton-shimmer mt-4 h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
