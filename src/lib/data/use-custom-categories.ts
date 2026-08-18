"use client";

import { useEffect, useState } from "react";
import {
  getCustomCategories,
  setCategoryFeatureOverrides,
  setCustomCategories,
  subscribeCustomCategories,
} from "./categories";

const CATEGORY_CATALOG_EVENT = "contratacr:category-catalog-updated";
const MIN_REFRESH_GAP_MS = 4_000;

let inFlight: Promise<void> | null = null;
let lastRefreshAt = 0;
let lastPayloadKey = "";

function payloadKey(d: unknown): string {
  try {
    return JSON.stringify(d);
  } catch {
    return `${Date.now()}`;
  }
}

export function refreshCustomCategories({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const now = Date.now();
  if (inFlight) return inFlight;
  if (!force && lastRefreshAt && now - lastRefreshAt < MIN_REFRESH_GAP_MS) return Promise.resolve();

  inFlight = fetch("/api/categories/approved", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d) return;
      const nextKey = payloadKey(d);
      // `force` bypasses the refresh interval, not equality. Reinstalling an
      // unchanged catalog invalidates every consumer and made tab focus and
      // section navigation perform a large, unnecessary render.
      if (nextKey === lastPayloadKey) return;
      lastPayloadKey = nextKey;
      if (Array.isArray(d.categoryFlags)) setCategoryFeatureOverrides(d.categoryFlags);
      if (Array.isArray(d.categories)) setCustomCategories(d.categories, Array.isArray(d.groups) ? d.groups : []);
    })
    .catch(() => {
      // Best-effort: the fixed catalog still works without the dynamic overlay.
    })
    .finally(() => {
      lastRefreshAt = Date.now();
      inFlight = null;
    });
  return inFlight;
}

export function notifyCategoryCatalogChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CATEGORY_CATALOG_EVENT));
}

/** Trigger the one-time load and subscribe to registry updates. Returns the
 *  current custom categories (kept fresh via the subscription). */
export function useCustomCategories() {
  const [, bump] = useState(0);
  useEffect(() => {
    void refreshCustomCategories({ force: !lastRefreshAt });

    const unsubscribe = subscribeCustomCategories(() => bump((n) => n + 1));
    const onCatalogChanged = () => { void refreshCustomCategories({ force: true }); };
    const onFocus = () => { void refreshCustomCategories(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshCustomCategories();
    };
    window.addEventListener(CATEGORY_CATALOG_EVENT, onCatalogChanged);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      unsubscribe();
      window.removeEventListener(CATEGORY_CATALOG_EVENT, onCatalogChanged);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return getCustomCategories();
}

export function useCategoryCatalogReady() {
  // The server and the browser must render the same first frame. Module state
  // can already be warm after a client navigation, but it does not exist in
  // the server render and previously caused /servicios to hydrate into a
  // different tree (skeleton on the server, catalog in the browser).
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void refreshCustomCategories({ force: !lastRefreshAt }).finally(() => {
      if (!cancelled) setReady(true);
    });
    const unsubscribe = subscribeCustomCategories(() => setReady(true));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return ready;
}

/** Mount once app-wide so the overlay is populated even on pages whose search
 *  surfaces (hero search, /servicios box) read `searchCategories` directly
 *  without rendering a <CategorySearch>. Renders nothing. */
export function CustomCategoriesLoader() {
  useCustomCategories();
  return null;
}
