const pulse = "animate-pulse motion-reduce:animate-none";

export function Skeleton({ className }: { className: string }) {
  return <span aria-hidden className={`ccr-delayed-loading ${pulse} block bg-[#e9eef3] ${className}`} />;
}

export function PanelSectionLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-1" aria-busy="true">
      <div className="ccr-delayed-loading rounded-2xl border border-[#d9edf7] bg-white px-4 py-4 shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eaf7fc]">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#009FD9] motion-reduce:animate-none" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#162543]">Cargando esta sección</p>
            <p className="mt-0.5 text-xs text-[#6b7280]">Estamos preparando la información más reciente.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>
      {Array.from({ length: rows }, (_, item) => (
        <div key={item} className="ccr-delayed-loading rounded-xl border border-[#e5e9ed] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
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
