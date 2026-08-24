"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  getDashboardCache,
  loadDashboardCache,
  setDashboardCache,
  subscribeDashboardCache,
} from "@/lib/dashboard-prefetch-cache";

// One way to hold server data in a client component: paint what this browser
// already has (memory, or session storage for the last five minutes), then
// fetch again quietly and swap in the answer. Coming back to a section shows
// its content at once instead of a skeleton; the network only ever updates it.
//
// `key` names the data (include the user id: session storage outlives a login).
// `null` disables the hook. `fallback` is what `data` is before anything has
// ever loaded, so callers never deal with null. `refreshOn` re-fetches quietly
// on `notificationsChanged`, window focus and tab visibility, with the debounce
// the dashboard tabs have always used (700 ms, at most every 1.6 s). Two
// components on the same key share one entry: an edit in one shows in the other.
type Options = {
  refreshOn?: boolean;
};

const REFRESH_EVENTS = ["notificationsChanged", "focus"] as const;
const noop = () => {};
const serverSnapshot = () => null;

export function useCachedResource<T>(key: string | null, loader: () => Promise<T>, fallback: T, options: Options = {}) {
  const { refreshOn = false } = options;
  // The loader is usually an inline closure; it is read through a ref so a new
  // identity per render never re-triggers the fetch.
  const loaderRef = useRef(loader);
  const fallbackRef = useRef(fallback);
  useEffect(() => {
    loaderRef.current = loader;
    fallbackRef.current = fallback;
  });

  // The cache is the store; React re-renders whenever this key is written.
  const subscribe = useCallback(
    (onChange: () => void) => (key ? subscribeDashboardCache(key, onChange) : noop),
    [key],
  );
  const getSnapshot = useCallback(() => (key ? getDashboardCache<T>(key) : null), [key]);
  const current = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const data = current ?? fallback;
  const loading = Boolean(key) && current === null;

  const refresh = useCallback(async (): Promise<T | undefined> => {
    if (!key) return undefined;
    try {
      return await loadDashboardCache<T>(key, () => loaderRef.current(), { force: true });
    } catch (error) {
      console.error(`[cached-resource] ${key} failed:`, error);
      return undefined;
    }
  }, [key]);

  const setData = useCallback((next: T | ((previous: T) => T)) => {
    if (!key) return;
    const previous = getDashboardCache<T>(key) ?? fallbackRef.current;
    const value = typeof next === "function" ? (next as (previous: T) => T)(previous) : next;
    setDashboardCache(key, value);
  }, [key]);

  // Always revalidate on arrival; the cached rows stay on screen meanwhile.
  useEffect(() => {
    if (key) void refresh();
  }, [key, refresh]);

  useEffect(() => {
    if (!refreshOn || !key) return;
    let timer: number | null = null;
    let last = 0;
    const soon = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) window.clearTimeout(timer);
      const elapsed = Date.now() - last;
      timer = window.setTimeout(() => {
        last = Date.now();
        void refresh();
      }, elapsed < 1600 ? 1600 - elapsed : 700);
    };
    REFRESH_EVENTS.forEach((name) => window.addEventListener(name, soon));
    document.addEventListener("visibilitychange", soon);
    return () => {
      REFRESH_EVENTS.forEach((name) => window.removeEventListener(name, soon));
      document.removeEventListener("visibilitychange", soon);
      if (timer) window.clearTimeout(timer);
    };
  }, [key, refreshOn, refresh]);

  return { data, loading, refresh, setData };
}
