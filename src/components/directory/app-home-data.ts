import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSearchParams, type DirectorySearchResult, type SearchVertical } from "@/lib/directory/search-schemas";
import { sitemapSections } from "@/lib/directory/sitemap-sections";
import { placeCardExtras } from "@/lib/directory/card-extras";
import { placePhotoSrc } from "@/lib/directory/place-photos";

/** Plain, serialisable data of one ranked card of the app home (no functions, no server-only values). */
export type TopPlace = { slug: string; name: string; section: string; area: string; photo: string | null; average: number | null; count: number };

const ORDER = ["restaurantes", "cafes", "farmacias", "supermercados"];

/**
 * The best-rated places of the first enabled section, for the "Top 10" band of the app home. Real data only: a place
 * needs at least one published review; returns [] (the band then shows no cards) on any problem or after 1.8 s.
 */
export async function loadTopPlaces(only?: string): Promise<TopPlace[]> {
  const enabled = sitemapSections().map((s) => s.section as string);
  const section = (only ? (enabled.includes(only) ? only : undefined) : ORDER.find((s) => enabled.includes(s))) as SearchVertical | undefined;
  if (!section) return [];
  const work = (async () => {
    const parsed = parseSearchParams(new URLSearchParams({ vertical: section, sort: "best_rated", limit: "10" }));
    if (!parsed.ok) return [];
    const { data, error } = await createAdminClient().rpc("dir_search", {
      p_vertical: parsed.vertical, p_q: parsed.q, p_filters: parsed.filters, p_lat: parsed.lat, p_lng: parsed.lng,
      p_radius_km: parsed.radiusKm, p_sort: parsed.sort, p_cursor: parsed.cursor, p_limit: 10,
    });
    if (error || !data) return [];
    const items = (data as DirectorySearchResult).items.flatMap((i) => (i.kind === "place" && i.rating.count > 0 && i.rating.average != null ? [i] : []));
    if (!items.length) return [];
    const extras = await placeCardExtras(items.map((i) => i.slug));
    return items.map((i): TopPlace => ({
      slug: i.slug, name: i.name, section,
      area: [i.address.adminArea3, i.address.adminArea2].filter(Boolean).join(", "),
      photo: extras[i.slug]?.photo ? placePhotoSrc(extras[i.slug]!.photo!, 800) : null,
      average: Number(i.rating.average), count: i.rating.count,
    }));
  })().catch(() => [] as TopPlace[]);
  return Promise.race([work, new Promise<TopPlace[]>((r) => setTimeout(() => r([]), 1800))]);
}

/** One business row of the phone home feed. */
export type FeedPlace = TopPlace & { distanceKm: number | null };
