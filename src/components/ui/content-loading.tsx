const pulse = "animate-pulse motion-reduce:animate-none";

export function Skeleton({ className }: { className: string }) {
  return <span aria-hidden className={`${pulse} block bg-[#e9eef3] ${className}`} />;
}

export function PanelSectionLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-1" aria-busy="true">
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
      {Array.from({ length: rows }, (_, item) => (
        <div key={item} className="rounded-xl border border-[#e5e9ed] bg-white p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-2/5 rounded-md" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-3 w-3/5 rounded-md" />
              <Skeleton className="h-3 w-4/5 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
