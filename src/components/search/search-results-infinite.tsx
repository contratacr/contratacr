"use client";

import { ContactAvailabilityProvider, type InitialAvailability } from "@/hooks/use-profesional-con-app";
import type { SearchedPlace } from "@/components/professionals/professional-schedule";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProfessionalCard, type ProfessionalCardData } from "@/components/professionals/professional-card";
import { SaveableCard } from "@/components/professionals/save-button";
import { ProfessionalCardSkeleton, SearchCardContactBoundary } from "@/components/search/professional-card-loading";

// The results list keeps growing as the person scrolls, twenty at a time, the
// way a marketplace should read. The first twenty come rendered from the
// server; from there this asks /api/buscar/results for the next slice — the
// same module resolves the URL, so the order never shifts. The page links
// (?page=2…) stay in the markup for crawlers and shared links; they are hidden
// here because the list no longer needs them.

type Loaded = { professional: ProfessionalCardData; forceContactOnly: boolean; preferVideo: boolean; contactAvailability?: InitialAvailability };


export function SearchResultsInfinite({
  searchedPlace,
  query,
  initialCount,
  initialOffset = 0,
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
  initialOffset?: number;
  total: number;
  activeCategory?: string;
  viewerProfileId?: string;
  highlightMetric: "rating" | "experience";
  searchReturnHref: string;
  searchedPlace?: SearchedPlace;
  loadingLabel: string;
  failedLabel: string;
  retryLabel: string;
}) {
  const [items, setItems] = useState<Loaded[]>([]);
  // A batch is revealed a few cards per frame: mounting twenty at once is one
  // long task that freezes the scroll; five at a time keeps it smooth.
  const [revealed, setRevealed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const retryTimer = useRef<number | null>(null);
  const revealFrame = useRef<number | null>(null);
  useEffect(() => () => {
    if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    if (revealFrame.current !== null) window.cancelAnimationFrame(revealFrame.current);
  }, []);
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
  const loadedCount = initialOffset + initialCount + items.length;
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
    // Finish mounting this batch before a scroll/observer can request another.
    if (inFlight.current || revealedRef.current < itemsRef.current.length || !hasMore || done) return;
    inFlight.current = true;
    setLoading(true);
    setShowLoading(false);
    const feedbackTimer = window.setTimeout(() => setShowLoading(true), 500);
    setFailed(false);
    try {
      const offset = initialOffset + initialCount + itemsRef.current.length;
      const response = await fetch(`/api/buscar/results?${query}${query ? "&" : ""}offset=${offset}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { professionals?: Loaded[]; contactAvailability?: InitialAvailability };
      // Keep the entire batch in its skeleton until the same response includes
      // its contact decisions. Never reveal a card with another loading CTA.
      const next = Array.isArray(payload.professionals) ? payload.professionals : [];
      if (viewerProfileId && next.length > 0 && (payload.contactAvailability?.viewerId !== viewerProfileId ||
        next.some(item => typeof payload.contactAvailability?.values[item.professional.id] !== "boolean"))) {
        throw new Error("search-contact-availability-missing");
      }
      if (next.length === 0) {
        setDone(true);
        return;
      }
      attempts.current = 0;
      const seen = new Set(itemsRef.current.map((item) => item.professional.id));
      const fresh = next.filter((item) => !seen.has(item.professional.id)).map(item => ({ ...item, contactAvailability: payload.contactAvailability }));
      itemsRef.current = [...itemsRef.current, ...fresh];
      const target = itemsRef.current.length;
      setItems(itemsRef.current);
      if (fresh.length === 0) {
        // Nothing new for this offset: the list is complete as far as the
        // server is concerned, so stop asking.
        revealedRef.current = target;
        setRevealed(target);
        setDone(true);
        return;
      }
      const step = () => {
        revealedRef.current = Math.min(target, revealedRef.current + 5);
        setRevealed(revealedRef.current);
        if (itemsRef.current.length === target && revealedRef.current < target) revealFrame.current = window.requestAnimationFrame(step);
      };
      revealFrame.current = window.requestAnimationFrame(step);
    } catch (error) {
      console.error("[search] could not load more results", error);
      // A blip (a deploy finishing, a flaky connection) gets one quiet retry
      // before the person is asked to tap.
      attempts.current += 1;
      if (attempts.current <= 1) retryTimer.current = window.setTimeout(() => void loadMoreRef.current(), 1500);
      else setFailed(true);
    } finally {
      window.clearTimeout(feedbackTimer);
      setShowLoading(false);
      inFlight.current = false;
      setLoading(false);
    }
  }, [done, hasMore, initialCount, initialOffset, query, viewerProfileId]);
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || failed || done) return;
    // Starts fetching a screen early, so the next cards are usually already
    // there by the time the last one scrolls past.
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
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { root: scroller, rootMargin: "600px 0px" });
    observer.observe(node);
    const nearEnd = () => {
      if (scroller) {
        const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        if (remaining < 600) void loadMore();
        return; // The outer document is not the results scroll container.
      }
      const pageRemaining = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      if (pageRemaining < 600) void loadMore();
    };
    scroller?.addEventListener("scroll", nearEnd, { passive: true });
    window.addEventListener("scroll", nearEnd, { passive: true });
    return () => {
      observer.disconnect();
      scroller?.removeEventListener("scroll", nearEnd);
      window.removeEventListener("scroll", nearEnd);
    };
  }, [done, failed, hasMore, loadMore]);

  return (
    <>
      {items.slice(0, revealed).map((item, index) => {
        const id = item.professional.id;
        const keepAlive = index >= revealed - 10 || windowState.near.has(id);
        if (!keepAlive) {
          return (
            <div key={id} ref={observeSlot} data-search-result="" data-result-id={id} className="ccr-search-card-slot" style={{ height: windowState.heights.get(id) ?? 217 }} aria-hidden />
          );
        }
        return (
        <div key={id} ref={observeSlot} data-search-result="" data-result-id={id} className="ccr-search-card-slot">
          <ContactAvailabilityProvider {...(item.contactAvailability ?? { viewerId: "", values: {}, resolvedAt: 0 })}>
          <SearchCardContactBoundary professionalId={id}>
          <SaveableCard pro={item.professional} isOwn={!!viewerProfileId && viewerProfileId === item.professional.profileId}>
            <ProfessionalCard
              professional={item.professional}
              activeCategory={activeCategory}
              viewerProfileId={viewerProfileId}
              rank={initialOffset + initialCount + index + 1}
              highlightMetric={highlightMetric}
              forceContactOnly={item.forceContactOnly}
              preferredLocationId={item.preferVideo ? "videoconsulta" : undefined}
              restrictToPreferredLocation={item.preferVideo}
              searchedPlace={searchedPlace}
              searchReturnHref={searchReturnHref}
            />
          </SaveableCard>
          </SearchCardContactBoundary>
          </ContactAvailabilityProvider>
        </div>
        );
      })}

      {hasMore && !failed && !done && (
        <div ref={sentinel} data-search-load-more="" className="min-h-px">
          {loading && showLoading && (
            <div className="flex flex-col gap-1.5 lg:gap-3" role="status" aria-busy="true" aria-label={loadingLabel}>
              <ProfessionalCardSkeleton />
              <ProfessionalCardSkeleton />
            </div>
          )}
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
