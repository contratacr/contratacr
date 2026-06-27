"use client";

import { useEffect, useState } from "react";
import {
  getCustomCategories,
  setCategoryFeatureOverrides,
  setCustomCategories,
  subscribeCustomCategories,
} from "./categories";

// Loads admin-approved custom categories ONCE per page-load into the shared
// registry in `categories.ts`, and re-renders any picker/search that calls this
// hook when they arrive. The fetch is module-level so multiple pickers share one
// request; subsequent mounts read the already-populated registry.
let started = false;

function ensureLoaded() {
  if (started) return;
  started = true;
  fetch("/api/categories/approved")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d && Array.isArray(d.categoryFlags)) setCategoryFeatureOverrides(d.categoryFlags);
      if (d && Array.isArray(d.categories)) setCustomCategories(d.categories);
    })
    .catch(() => {
      // Best-effort: the fixed catalog still works without the overlay.
      started = false;
    });
}

/** Trigger the one-time load and subscribe to registry updates. Returns the
 *  current custom categories (kept fresh via the subscription). */
export function useCustomCategories() {
  const [, bump] = useState(0);
  useEffect(() => {
    ensureLoaded();
    return subscribeCustomCategories(() => bump((n) => n + 1));
  }, []);
  return getCustomCategories();
}

/** Mount once app-wide so the overlay is populated even on pages whose search
 *  surfaces (hero search, /categorias box) read `searchCategories` directly
 *  without rendering a <CategorySearch>. Renders nothing. */
export function CustomCategoriesLoader() {
  useCustomCategories();
  return null;
}
