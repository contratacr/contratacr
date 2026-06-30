import { Navbar } from "@/components/layout/navbar";
import { CardListSkeleton } from "@/components/ui/loading-state";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="mb-6 flex animate-pulse items-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-[#eaf7fd]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-36 rounded-full bg-[#eef2f6]" />
            <div className="h-6 w-64 max-w-full rounded-full bg-[#e5edf4]" />
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <aside className="hidden rounded-2xl border border-[#e5e7eb] bg-white p-3 shadow-sm lg:block">
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-11 animate-pulse rounded-xl bg-[#f3f7fa]" />
              ))}
            </div>
          </aside>
          <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-5 animate-pulse space-y-2">
              <div className="h-5 w-48 rounded-full bg-[#e5edf4]" />
              <div className="h-3 w-72 max-w-full rounded-full bg-[#f1f5f9]" />
            </div>
            <CardListSkeleton rows={3} />
          </section>
        </div>
      </main>
    </div>
  );
}
