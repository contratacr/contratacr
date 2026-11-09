import { cn } from "@/lib/utils";

export function SupportMessageSkeleton() {
  return <div data-testid="support-message-skeleton" aria-hidden="true" className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
    <span className="ccr-skeleton-shimmer mx-auto h-5 w-24 rounded-full bg-[#e8eef4]" />
    {["mr-auto w-[72%] rounded-bl-md", "ml-auto w-[56%] rounded-br-md", "mr-auto w-[64%] rounded-bl-md"].map((position, index) => <div key={position} className={cn("ccr-skeleton-shimmer space-y-2 rounded-[18px] bg-[#e6eef4] p-4", position)}>
      <span className="block h-3 w-3/4 rounded-full bg-[#cbd9e4]" />
      <span className={cn("block h-3 rounded-full bg-[#cbd9e4]", index === 1 ? "w-1/2" : "w-full")} />
    </div>)}
  </div>;
}

export function SupportThreadSkeleton({ fullPage = false }: { fullPage?: boolean }) {
  return <div data-testid="support-thread-skeleton" role="status" aria-busy="true" className={cn("flex min-h-[360px] flex-1 flex-col overflow-hidden bg-white", fullPage && "min-h-dvh")}>
    <div aria-hidden="true" className="flex h-[65px] shrink-0 items-center gap-3 border-b border-[#e5e7eb] px-4">
      <span className="ccr-skeleton-shimmer h-9 w-9 rounded-full bg-[#e6eef4]" />
      <span className="ccr-skeleton-shimmer h-10 w-10 rounded-full bg-[#e6eef4]" />
      <span className="flex-1 space-y-2"><span className="ccr-skeleton-shimmer block h-4 w-40 rounded-full bg-[#e6eef4]" /><span className="ccr-skeleton-shimmer block h-3 w-20 rounded-full bg-[#e6eef4]" /></span>
    </div>
    <SupportMessageSkeleton />
    <div aria-hidden="true" className="mt-auto flex shrink-0 items-center gap-3 p-4"><span className="ccr-skeleton-shimmer h-11 flex-1 rounded-3xl bg-[#e6eef4]" /><span className="ccr-skeleton-shimmer h-11 w-11 rounded-full bg-[#e6eef4]" /></div>
  </div>;
}
