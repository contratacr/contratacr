/**
 * Directory ordering (places and listings). Pure functions, no I/O.
 *
 * Neutrality rule: order NEVER depends on payment. Inputs are only text match,
 * geography, client ratings, profile completeness, listing freshness, price,
 * distance and date. scripts/pro/verify-directory-ranking-neutrality.mjs
 * enforces that this file stays free of commercial signals.
 */
import { compareByRating } from "../search/ranking";

export type DirectorySort = "relevance" | "rating" | "distance" | "priceAsc" | "priceDesc" | "newest";

export type DirectoryItem = {
  id: string;
  kind: "place" | "listing";
  name?: string | null;
  /** Extra searchable text (category, brand, model...). */
  keywords?: string[] | null;
  adminArea1?: string | null; // province
  adminArea2?: string | null; // canton
  adminArea3?: string | null; // district
  ratingAvg?: number | null;
  reviewCount?: number | null;
  verificationStatus?: string | null;
  /** 0..1; when absent it is computed from `completenessFields`. */
  completeness?: number | null;
  completenessFields?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
  /** Listings: first publication. Freshness uses it (never updatedAt: editing must not bump a listing). */
  publishedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  distanceKm?: number | null;
  priceCrcNorm?: number | null;
};

export type DirectoryQuery = {
  text?: string | null;
  adminArea1?: string | null;
  adminArea2?: string | null;
  adminArea3?: string | null;
  sort?: DirectorySort | null;
  /** Reference time, injectable for tests. */
  now?: Date;
};

export type RankedDirectoryItem<T extends DirectoryItem = DirectoryItem> = {
  item: T;
  ranking_reason: string[];
};

export const FRESHNESS_MAX_BUCKET = 3;

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** 3 exact name, 2 name prefix, 1.5 whole word in name, 1 substring in name, 0.5 in keywords, 0 none. */
export function textMatchScore(query: string | null | undefined, item: Pick<DirectoryItem, "name" | "keywords">): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const name = normalizeText(item.name);
  if (name === q) return 3;
  if (name.startsWith(q)) return 2;
  if ((` ${name} `).includes(` ${q} `)) return 1.5;
  if (name.includes(q)) return 1;
  const tokens = q.split(" ");
  if (tokens.length > 1 && tokens.every((t) => name.includes(t))) return 1;
  if ((item.keywords ?? []).some((k) => normalizeText(k).includes(q))) return 0.5;
  return 0;
}

/** 3 district, 2 canton, 1 province, 0 none (only levels the query specifies). */
export function localityRank(query: DirectoryQuery, item: DirectoryItem): number {
  const same = (a?: string | null, b?: string | null) => !!a && !!b && normalizeText(a) === normalizeText(b);
  if (same(query.adminArea3, item.adminArea3) && (!query.adminArea2 || same(query.adminArea2, item.adminArea2))) return 3;
  if (same(query.adminArea2, item.adminArea2) && (!query.adminArea1 || same(query.adminArea1, item.adminArea1))) return 2;
  if (same(query.adminArea1, item.adminArea1)) return 1;
  return 0;
}

export function profileCompleteness(item: DirectoryItem): number {
  if (typeof item.completeness === "number") return Math.max(0, Math.min(1, item.completeness));
  const fields = item.completenessFields;
  if (!fields) return 0;
  const keys = Object.keys(fields);
  if (!keys.length) return 0;
  const filled = keys.filter((k) => {
    const v = fields[k];
    return Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== "";
  }).length;
  return filled / keys.length;
}

function toTime(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/**
 * Listings only. Capped bucket 0..3 (<=7d 3, <=30d 2, <=90d 1, else 0) so it only separates near-ties.
 * Measured from the publication date (owner decision 2026-11-16): editing a listing never makes it "fresh" again.
 */
export function freshnessBucket(item: DirectoryItem, now: Date = new Date()): number {
  if (item.kind !== "listing") return 0;
  const t = toTime(item.publishedAt ?? item.createdAt);
  if (t == null) return 0;
  const days = (now.getTime() - t) / 86_400_000;
  if (days <= 7) return FRESHNESS_MAX_BUCKET;
  if (days <= 30) return 2;
  if (days <= 90) return 1;
  return 0;
}

const byId = (a: DirectoryItem, b: DirectoryItem) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Ascending with nulls last. */
function nullsLast(a: number | null, b: number | null, dir: 1 | -1 = 1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

function reasons(query: DirectoryQuery, item: DirectoryItem, now: Date): string[] {
  const out: string[] = [];
  const sort = query.sort ?? "relevance";
  const text = textMatchScore(query.text, item);
  if (text >= 3) out.push("text_exact");
  else if (text >= 2) out.push("text_prefix");
  else if (text >= 1.5) out.push("text_word");
  else if (text >= 1) out.push("text_partial");
  else if (text > 0) out.push("text_keyword");
  const loc = localityRank(query, item);
  if (loc === 3) out.push("locality_district");
  else if (loc === 2) out.push("locality_canton");
  else if (loc === 1) out.push("locality_province");
  if ((item.reviewCount ?? 0) >= 3) out.push("rating_credible");
  if (item.verificationStatus === "verified") out.push("verified");
  if (profileCompleteness(item) >= 0.8) out.push("profile_complete");
  if (freshnessBucket(item, now) >= 2) out.push("fresh_listing");
  if (sort === "distance" && num(item.distanceKm) != null) out.push("distance");
  if (sort === "priceAsc") out.push(num(item.priceCrcNorm) != null ? "price_asc" : "price_missing");
  if (sort === "priceDesc") out.push(num(item.priceCrcNorm) != null ? "price_desc" : "price_missing");
  if (sort === "newest") out.push("newest");
  if (sort === "rating") out.push("sort_rating");
  if (!out.length) out.push("id_tiebreak");
  return out;
}

export function compareDirectoryItems(query: DirectoryQuery, a: DirectoryItem, b: DirectoryItem): number {
  const now = query.now ?? new Date();
  const sort = query.sort ?? "relevance";
  switch (sort) {
    case "rating":
      return compareByRating(a, b) || byId(a, b);
    case "distance":
      return nullsLast(num(a.distanceKm), num(b.distanceKm)) || compareByRating(a, b) || byId(a, b);
    case "priceAsc":
      return nullsLast(num(a.priceCrcNorm), num(b.priceCrcNorm)) || compareByRating(a, b) || byId(a, b);
    case "priceDesc":
      return nullsLast(num(a.priceCrcNorm), num(b.priceCrcNorm), -1) || compareByRating(a, b) || byId(a, b);
    case "newest":
      return (toTime(b.createdAt) ?? 0) - (toTime(a.createdAt) ?? 0) || byId(a, b);
    default:
      return (
        textMatchScore(query.text, b) - textMatchScore(query.text, a) ||
        localityRank(query, b) - localityRank(query, a) ||
        compareByRating(a, b) ||
        profileCompleteness(b) - profileCompleteness(a) ||
        freshnessBucket(b, now) - freshnessBucket(a, now) ||
        byId(a, b)
      );
  }
}

export function rankDirectory<T extends DirectoryItem>(items: readonly T[], query: DirectoryQuery = {}): RankedDirectoryItem<T>[] {
  const now = query.now ?? new Date();
  const q = { ...query, now };
  return [...items]
    .sort((a, b) => compareDirectoryItems(q, a, b))
    .map((item) => ({ item, ranking_reason: reasons(q, item, now) }));
}
