"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Grey placeholder cards shown while the next page loads. */
export function ResultSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} aria-hidden className="min-w-0 animate-pulse rounded-2xl border border-[#eef2f6] bg-white p-4">
          <div className="h-4 w-2/3 rounded bg-[#e8eef3]" />
          <div className="mt-2 h-3 w-1/3 rounded bg-[#eef2f6]" />
          <div className="mt-2 h-3 w-1/2 rounded bg-[#eef2f6]" />
          <div className="mt-4 h-11 w-full rounded-full bg-[#eef2f6]" />
        </li>
      ))}
    </>
  );
}

/**
 * Infinite results (owner 2026-11-26): when the end of the list comes into view, the next page is asked for and appended;
 * a skeleton shows meanwhile. `load(next, startRank)` returns the server-rendered cards and the following cursor.
 */
export function InfiniteMore({ initialNext, startRank, load, label }: {
  initialNext: string | null;
  startRank: number;
  load: (next: string, startRank: number) => Promise<{ items: ReactNode; next: string | null; count: number }>;
  label: string;
}) {
  const [chunks, setChunks] = useState<ReactNode[]>([]);
  const [next, setNext] = useState(initialNext);
  const [rank, setRank] = useState(startRank);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next) return;
    const root = el.closest<HTMLElement>(".ccr-search-sheet-scroll");
    const scrollable = root && getComputedStyle(root).overflowY !== "visible" ? root : null;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || loading || !next) return;
      setLoading(true);
      load(next, rank).then((r) => {
        setChunks((c) => [...c, r.items]);
        setRank((x) => x + r.count);
        setNext(r.next);
      }).catch(() => setNext(null)).finally(() => setLoading(false));
    }, { root: scrollable, rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [next, rank, loading, load]);
  return (
    <>
      {chunks.map((c, i) => <ChunkFragment key={i}>{c}</ChunkFragment>)}
      {next && <li ref={sentinel} aria-hidden className="h-px" />}
      {loading && <ResultSkeleton />}
      {loading && <li className="sr-only" role="status">{label}</li>}
    </>
  );
}

function ChunkFragment({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
