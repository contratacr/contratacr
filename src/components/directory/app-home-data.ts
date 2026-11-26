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

const FEED_PLACE_SECTIONS = ["restaurantes", "cafes", "farmacias", "supermercados", "talleres", "belleza"];

/**
 * Businesses for the phone home feed (owner, 2026-11-26): the ones with the most reviews, or the nearest when the
 * visitor shared a location. Real data only: "most reviews" needs at least one published review. [] on any problem.
 */
export async function loadFeedPlaces(near: { lat: number; lng: number } | null, limit = 6): Promise<FeedPlace[]> {
  const enabled = sitemapSections().map((s) => s.section as string);
  const sections = FEED_PLACE_SECTIONS.filter((s) => enabled.includes(s)) as SearchVertical[];
  if (!sections.length) return [];
  const work = (async () => {
    const lists = await Promise.all(sections.map(async (section) => {
      const params = new URLSearchParams({ vertical: section, sort: near ? "distance" : "best_rated", limit: "10" });
      if (near) { params.set("lat", String(near.lat)); params.set("lng", String(near.lng)); }
      const parsed = parseSearchParams(params);
      if (!parsed.ok) return [];
      const { data, error } = await createAdminClient().rpc("dir_search", {
        p_vertical: parsed.vertical, p_q: parsed.q, p_filters: parsed.filters, p_lat: parsed.lat, p_lng: parsed.lng,
        p_radius_km: parsed.radiusKm, p_sort: parsed.sort, p_cursor: parsed.cursor, p_limit: 10,
      });
      if (error || !data) return [];
      return (data as DirectorySearchResult).items.flatMap((i) => (i.kind === "place" && (near || i.rating.count > 0) ? [{ i, section }] : []));
    }));
    const all = lists.flat()
      .sort((a, b) => near ? (a.i.distanceKm ?? 1e9) - (b.i.distanceKm ?? 1e9) : (b.i.rating.count - a.i.rating.count) || (Number(b.i.rating.average ?? 0) - Number(a.i.rating.average ?? 0)))
      .slice(0, limit);
    if (!all.length) return [];
    const extras = await placeCardExtras(all.map(({ i }) => i.slug));
    return all.map(({ i, section }): FeedPlace => ({
      slug: i.slug, name: i.name, section,
      area: [i.address.adminArea3, i.address.adminArea2].filter(Boolean).join(", "),
      photo: extras[i.slug]?.photo ? placePhotoSrc(extras[i.slug]!.photo!, 320) : null,
      average: i.rating.average != null ? Number(i.rating.average) : null, count: i.rating.count, distanceKm: i.distanceKm,
    }));
  })().catch(() => [] as FeedPlace[]);
  return Promise.race([work, new Promise<FeedPlace[]>((r) => setTimeout(() => r([]), 2500))]);
}
