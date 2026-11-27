"use server";
import type { ReactNode } from "react";
import { loadDirectorySearch, type SearchPageParams } from "@/lib/directory/search-server";
import { encodeCursor, type SearchVertical } from "@/lib/directory/search-schemas";
import { placeCardExtras } from "@/lib/directory/card-extras";
import { DIR_ENABLED } from "@/lib/directory/feature-flags";
import { PlaceCard } from "@/components/directory/place-card";
import { sectionRatingSort } from "@/lib/directory/place-verticals";
import { placeMapPoints } from "@/lib/directory/place-map-points";
import type { PlacesMapPoint } from "@/components/maps/places-map";

/**
 * The next page of a directory section for the infinite results list (owner 2026-11-26: 20 at a time while the person
 * scrolls). Same search, same order, same cards and same pins as the server page; only the cursor changes.
 */
export async function morePlaces(section: string, values: Record<string, string>, locale: string, cursor: string, startRank: number): Promise<{ items: ReactNode; next: string | null; count: number; points?: PlacesMapPoint[] }> {
  if (!DIR_ENABLED) return { items: null, next: null, count: 0 };
  const sp: SearchPageParams = { ...values, cursor };
  const page = await loadDirectorySearch(section as SearchVertical, sp, { defaultSort: sectionRatingSort(section) ? "best_rated" : "relevance" });
  if (!page.ok) return { items: null, next: null, count: 0 };
  const places = page.result.items.flatMap((it) => (it.kind === "place" ? [it] : []));
  const extras = await placeCardExtras(places.map((p) => p.slug));
  const next = page.result.nextCursor ? encodeCursor(page.result.nextCursor) : null;
  const items = places.map((item, n) => (
    <li key={item.key} className="ccr-search-card-slot min-w-0">
      <PlaceCard item={item} locale={locale} rank={startRank + n} extra={extras[item.slug] ?? null} />
    </li>
  ));
  // Their pins too (2026-11-27): the results map adds them without moving the camera (ccr:places-map-add).
  return { items, next, count: places.length, points: placeMapPoints(places, locale, startRank) };
}
