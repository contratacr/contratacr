function HeaderSkeleton() {
  return (
    <div className="h-16 border-b border-[#e5e7eb] bg-white px-4 sm:px-6">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-4">
        <div className="h-8 w-36 animate-pulse rounded-lg bg-[#eaf7fd]" />
        <div className="hidden h-8 w-64 animate-pulse rounded-lg bg-[#f1f5f9] sm:block" />
        <div className="ml-auto h-9 w-24 animate-pulse rounded-xl bg-[#f1f5f9]" />
      </div>
    </div>
  );
}

export function SearchRouteLoading() {
  return (
    <div className="min-h-screen bg-[#f4f7fa]" aria-busy="true">
      <HeaderSkeleton />
      <div className="mx-auto max-w-[1920px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-5 hidden space-y-2 lg:block">
          <div className="h-7 w-52 animate-pulse rounded-lg bg-[#e7edf3]" />
          <div className="h-4 w-40 animate-pulse rounded-lg bg-[#edf2f6]" />
        </div>
        <div className="grid min-h-[calc(100vh-8rem)] gap-4 lg:grid-cols-[minmax(380px,520px)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="h-11 animate-pulse rounded-xl bg-white shadow-sm" />
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-56 animate-pulse rounded-2xl border border-[#e5e7eb] bg-white shadow-sm" />
            ))}
          </div>
          <div className="hidden min-h-[560px] animate-pulse rounded-2xl border border-[#dbe6ed] bg-[#e7f3ed] lg:block" />
        </div>
      </div>
    </div>
  );
}

export function DashboardRouteLoading() {
  return (
    <div className="min-h-screen bg-[#f4f7fa]" aria-busy="true">
      <HeaderSkeleton />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center gap-3">
          <div className="h-12 w-12 animate-pulse rounded-full bg-[#eaf7fd]" />
          <div className="space-y-2">
            <div className="h-5 w-48 animate-pulse rounded-lg bg-[#e7edf3]" />
            <div className="h-4 w-28 animate-pulse rounded-lg bg-[#edf2f6]" />
          </div>
        </div>
        <div className="flex gap-5">
          <div className="hidden w-60 shrink-0 space-y-2 lg:block">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-10 animate-pulse rounded-xl bg-white" />
            ))}
          </div>
          <div className="min-w-0 flex-1 rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-5 h-7 w-52 animate-pulse rounded-lg bg-[#e7edf3]" />
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-2xl border border-[#edf1f5] bg-[#fafcfd]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
