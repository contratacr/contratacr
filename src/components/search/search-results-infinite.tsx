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
  failedLabel,
  retryLabel,
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
  failedLabel: string;
  retryLabel: string;
}) {
  const [items, setItems] = useState<Loaded[]>([]);
  // A batch is revealed a few cards per frame: mounting twenty at once is one
  // long task that freezes the scroll; five at a time keeps it smooth.
  const [revealed, setRevealed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const attempts = useRef(0);
  // State updates are asynchronous; the observer and the scroll backstop can
  // both fire in the same tick, so the guard against a double request must be
  // synchronous, and the reveal counter must follow the list's real length.
  const inFlight = useRef(false);
  const itemsRef = useRef<Loaded[]>([]);
  const revealedRef = useRef(0);
  const [done, setDone] = useState(false);
  // Windowing: a card that has scrolled far away is replaced by a placeholder
  // of its measured height, so two hundred loaded results never mean two
  // hundred live cards (observers, timers, schedules) on a phone. Cards near
  // the viewport — and the newest ten, which the loader relies on — stay real.
  const [windowState, setWindowState] = useState<{ near: Set<string>; heights: Map<string, number> }>(() => ({ near: new Set(), heights: new Map() }));
  const slotObserver = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      setWindowState((current) => {
        const near = new Set(current.near);
        const heights = new Map(current.heights);
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.resultId;
          if (!id) continue;
          if (entry.isIntersecting) {
            near.add(id);
          } else {
            near.delete(id);
            // Measured as it leaves, so its placeholder keeps the scroll honest.
            if (entry.boundingClientRect.height > 0) heights.set(id, entry.boundingClientRect.height);
          }
        }
        return { near, heights };
      });
    }, { rootMargin: "1500px 0px" });
    slotObserver.current = io;
    return () => io.disconnect();
  }, []);
  const observeSlot = useCallback((node: HTMLDivElement | null) => {
    if (node) slotObserver.current?.observe(node);
  }, []);
  // The quiet retry needs the latest loader without referencing it inside itself.
  const loadMoreRef = useRef<() => Promise<void>>(async () => {});
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
    if (inFlight.current || !hasMore) return;
    inFlight.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const offset = initialCount + itemsRef.current.length;
      const response = await fetch(`/api/buscar/results?${query}${query ? "&" : ""}offset=${offset}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { professionals?: Loaded[] };
      const next = Array.isArray(payload.professionals) ? payload.professionals : [];
      if (next.length === 0) {
        setFailed(true);
        return;
      }
      attempts.current = 0;
      const seen = new Set(itemsRef.current.map((item) => item.professional.id));
      const fresh = next.filter((item) => !seen.has(item.professional.id));
      itemsRef.current = [...itemsRef.current, ...fresh];
      const target = itemsRef.current.length;
      setItems(itemsRef.current);
      if (fresh.length === 0) {
        // Nothing new for this offset: the list is complete as far as the
        // server is concerned, so stop asking.
        setRevealed(target);
        setDone(true);
        return;
      }
      const step = () => {
        setRevealed((current) => Math.min(target, current + 5));
        if (itemsRef.current.length === target && revealedRef.current < target) window.requestAnimationFrame(step);
      };
      window.requestAnimationFrame(step);
    } catch (error) {
      console.error("[search] could not load more results", error);
      // A blip (a deploy finishing, a flaky connection) gets one quiet retry
      // before the person is asked to tap.
      attempts.current += 1;
      if (attempts.current <= 1) window.setTimeout(() => void loadMoreRef.current(), 1500);
      else setFailed(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [hasMore, initialCount, query]);
  useEffect(() => { revealedRef.current = revealed; }, [revealed]);
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

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
      {items.slice(0, revealed).map((item, index) => {
        const id = item.professional.id;
        const keepAlive = index >= revealed - 10 || windowState.near.has(id);
        if (!keepAlive) {
          return (
            <div key={id} ref={observeSlot} data-search-result="" data-result-id={id} className="ccr-search-card-slot" style={{ height: windowState.heights.get(id) ?? 320 }} aria-hidden />
          );
        }
        return (
        <div key={id} ref={observeSlot} data-search-result="" data-result-id={id} className="ccr-search-card-slot">
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
        );
      })}

      {revealed < items.length && (
        <div className="flex flex-col gap-1.5 lg:gap-3" aria-hidden>
          <CardSkeleton />
        </div>
      )}

      {hasMore && !failed && !done && (
        <div ref={sentinel} className="flex flex-col gap-1.5 lg:gap-3" role="status" aria-busy={loading} aria-label={loadingLabel}>
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {failed && hasMore && !done && (
        <div className="bg-white px-4 py-6 text-center lg:rounded-2xl lg:border lg:border-[#e5e7eb]">
          <p className="text-sm font-medium text-[#64748b]">{failedLabel}</p>
          <button
            type="button"
            onClick={() => { attempts.current = 0; setFailed(false); void loadMore(); }}
            className="mt-3 inline-flex h-11 items-center justify-center rounded-full bg-[#009FD9] px-5 text-sm font-bold text-white transition hover:bg-[#008dbf]"
          >
            {retryLabel}
          </button>
        </div>
      )}
    </>
  );
}
