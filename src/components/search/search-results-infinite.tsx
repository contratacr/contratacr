"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProfessionalCard, type ProfessionalCardData } from "@/components/professionals/professional-card";
import { SaveableCard } from "@/components/professionals/save-button";
import { Skeleton } from "@/components/ui/content-loading";

// The results list keeps growing as the person scrolls, twenty at a time, the
// way a marketplace should read. The first twenty come rendered from the
// server; from there this asks /api/buscar/results for the next slice — the
// same module resolves the URL, so the order never shifts. The page links
// (?page=2…) stay in the markup for crawlers and shared links; they are hidden
// here because the list no longer needs them.

type Loaded = { professional: ProfessionalCardData; forceContactOnly: boolean; preferVideo: boolean };

function CardSkeleton() {
  return (
    <div className="w-full bg-white px-4 py-5 lg:rounded-2xl lg:border lg:border-[#e5e7eb]" aria-hidden>
      <div className="flex items-start gap-3">
        <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="mt-4 h-10 w-full rounded-xl" />
    </div>
  );
}

export function SearchResultsInfinite({
  query,
  initialCount,
  total,
  activeCategory,
  viewerProfileId,
  highlightMetric,
  searchReturnHref,
  loadingLabel,
}: {
  /** The current search as a query string, without page/offset. */
  query: string;
  initialCount: number;
  total: number;
  activeCategory?: string;
  viewerProfileId?: string;
  highlightMetric: "rating" | "experience";
  searchReturnHref: string;
  loadingLabel: string;
}) {
  const [items, setItems] = useState<Loaded[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const loadedCount = initialCount + items.length;
  const hasMore = loadedCount < total;

  // The page links are the fallback for crawlers and for a failed script; with
  // the list growing on its own they would only be noise.
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>("[data-search-pagination]");
    if (!nav) return;
    nav.classList.add("hidden");
    return () => nav.classList.remove("hidden");
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/buscar/results?${query}${query ? "&" : ""}offset=${loadedCount}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { professionals?: Loaded[] };
      const next = Array.isArray(payload.professionals) ? payload.professionals : [];
      if (next.length === 0) {
        setFailed(true);
        return;
      }
      setItems((current) => [...current, ...next]);
    } catch (error) {
      console.error("[search] could not load more results", error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [hasMore, loadedCount, loading, query]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || failed) return;
    // Starts fetching a screen early, so the next cards are usually already
    // there by the time the last one scrolls past.
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "800px 0px" });
    observer.observe(node);

    // The phone list lives in the results sheet, and below it sits more of the
    // page, so a fast flick can carry the sentinel past the viewport without it
    // ever intersecting. Being near the end of whatever is scrolling is enough.
    const scroller = (() => {
      let parent = node.parentElement;
      while (parent) {
        const overflow = getComputedStyle(parent).overflowY;
        if (overflow === "auto" || overflow === "scroll") return parent;
        parent = parent.parentElement;
      }
      return null;
    })();
    const nearEnd = () => {
      if (scroller) {
        const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        if (remaining < 1200) { void loadMore(); return; }
      }
      const pageRemaining = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      if (pageRemaining < 1200) void loadMore();
    };
    scroller?.addEventListener("scroll", nearEnd, { passive: true });
    window.addEventListener("scroll", nearEnd, { passive: true });
    return () => {
      observer.disconnect();
      scroller?.removeEventListener("scroll", nearEnd);
      window.removeEventListener("scroll", nearEnd);
    };
  }, [failed, hasMore, loadMore]);

  return (
    <>
      {items.map((item, index) => (
        <div key={item.professional.id} data-search-result="">
          <SaveableCard pro={item.professional} isOwn={!!viewerProfileId && viewerProfileId === item.professional.profileId}>
            <ProfessionalCard
              professional={item.professional}
              slots={[]}
              slotsInitiallyLoaded={false}
              activeCategory={activeCategory}
              viewerProfileId={viewerProfileId}
              rank={initialCount + index + 1}
              highlightMetric={highlightMetric}
              forceContactOnly={item.forceContactOnly}
              preferredLocationId={item.preferVideo ? "videoconsulta" : undefined}
              restrictToPreferredLocation={item.preferVideo}
              syncScheduleWithSearchLoading
              searchReturnHref={searchReturnHref}
            />
          </SaveableCard>
        </div>
      ))}

      {hasMore && !failed && (
        <div ref={sentinel} className="flex flex-col gap-1.5 lg:gap-3" role="status" aria-busy={loading} aria-label={loadingLabel}>
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {failed && hasMore && (
        <div className="bg-white px-4 py-6 text-center lg:rounded-2xl lg:border lg:border-[#e5e7eb]">
          <button
            type="button"
            onClick={() => { setFailed(false); void loadMore(); }}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#009FD9] px-5 text-sm font-bold text-white transition hover:bg-[#008dbf]"
          >
            {loadingLabel}
          </button>
        </div>
      )}
    </>
  );
}
