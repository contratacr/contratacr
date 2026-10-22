"use client";

import { APP_RESUME_EVENT } from "@/lib/app-events";

import { APP_DATA_INVALIDATED_EVENT, APP_DATA_INVALIDATED_KEY, readLastAppDataInvalidation, type AppDataDomain, type AppDataInvalidation } from "@/lib/app-data-invalidation";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  getDashboardCache,
  loadDashboardCache,
  olvidarDashboardCache,
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
  invalidationDomain?: AppDataDomain;
};

const REFRESH_EVENTS = ["notificationsChanged", "focus", APP_RESUME_EVENT] as const;
const noop = () => {};
const serverSnapshot = () => null;

/** Read cached data before paint, with a deterministic server snapshot. */
export function useDashboardCacheSnapshot<T>(key: string | null) {
  const subscribe = useCallback(
    (onChange: () => void) => (key ? subscribeDashboardCache(key, onChange) : noop), [key],
  );
  const snapshot = useCallback(() => key ? getDashboardCache<T>(key) : null, [key]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function useCachedResource<T>(key: string | null, loader: () => Promise<T>, fallback: T, options: Options = {}) {
  const { refreshOn = false, invalidationDomain } = options;
  // The loader is usually an inline closure; it is read through a ref so a new
  // identity per render never re-triggers the fetch.
  const loaderRef = useRef(loader);
  const fallbackRef = useRef(fallback);
  useEffect(() => {
    loaderRef.current = loader;
    fallbackRef.current = fallback;
  });

  const current = useDashboardCacheSnapshot<T>(key);
  const data = current ?? fallback;
  const loading = Boolean(key) && current === null;

  /**
   * Vuelve a pedir los datos. Lo que ya está en pantalla se queda mientras
   * tanto, que es lo correcto al entrar a una sección.
   *
   * `esperandoNuevo` es para DESPUÉS DE CREAR algo: ahí lo guardado es la lista
   * SIN lo recién creado —y si era lo primero, una lista vacía—, así que
   * mantenerla en pantalla significa enseñar «todavía no tienes nada» y, un
   * instante después, la cosa que la persona acaba de crear. Con esta marca se
   * limpia lo guardado y la sección muestra su esqueleto hasta que llega la
   * lista de verdad.
   */
  const refresh = useCallback(async ({ esperandoNuevo = false } = {}): Promise<T | undefined> => {
    if (!key) return undefined;
    if (esperandoNuevo) olvidarDashboardCache(key);
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

  // router.refresh only updates server props; mounted client lists have their
  // own cache and must refetch after a successful publication as well.
  useEffect(() => {
    if (!key || !invalidationDomain) return;
    const invalidate = (detail: AppDataInvalidation | null) => {
      if (detail && (detail.domain === invalidationDomain || detail.domain === "all")) void refresh();
    };
    const onMutation = (event: Event) => invalidate((event as CustomEvent<AppDataInvalidation>).detail);
    const onStorage = (event: StorageEvent) => {
      if (event.key === APP_DATA_INVALIDATED_KEY) invalidate(readLastAppDataInvalidation());
    };
    window.addEventListener(APP_DATA_INVALIDATED_EVENT, onMutation);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(APP_DATA_INVALIDATED_EVENT, onMutation);
      window.removeEventListener("storage", onStorage);
    };
  }, [key, invalidationDomain, refresh]);

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
