// Run: node --test scripts/directory/
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const root = new URL("../../src/lib/", import.meta.url).href;
registerHooks({ resolve(s, c, next) { return next(c.parentURL?.startsWith(root) && s.startsWith(".") && !/\.[a-z]+$/i.test(s) ? s + ".ts" : s, c); } });
const { rankDirectory, textMatchScore, freshnessBucket, profileCompleteness, normalizeText } = await import("../../src/lib/directory/ranking.ts");

const now = new Date("2026-11-16T00:00:00Z");
const ids = (r) => r.map((x) => x.item.id);

test("text match beats locality, locality beats rating", () => {
  const items = [
    { id: "c", kind: "place", name: "Soda Tica", adminArea2: "Escazu", ratingAvg: 5, reviewCount: 50 },
    { id: "b", kind: "place", name: "Soda Tica Centro", adminArea2: "Escazu", ratingAvg: 3, reviewCount: 2 },
    { id: "a", kind: "place", name: "Soda Tica", adminArea2: "Cartago", ratingAvg: 5, reviewCount: 50 },
    { id: "d", kind: "place", name: "Otro", keywords: ["soda tica"], adminArea2: "Escazu", ratingAvg: 5, reviewCount: 99 },
  ];
  const r = rankDirectory(items, { text: "soda tica", adminArea2: "Escazú", now });
  assert.deepEqual(ids(r), ["c", "a", "b", "d"]);
  assert.ok(r[0].ranking_reason.includes("text_exact") && r[0].ranking_reason.includes("locality_canton"));
});

test("rating uses compareByRating (credibility prior)", () => {
  const items = [
    { id: "few", kind: "place", ratingAvg: 5, reviewCount: 1 },
    { id: "many", kind: "place", ratingAvg: 4.8, reviewCount: 100 },
  ];
  assert.deepEqual(ids(rankDirectory(items, { sort: "rating", now })), ["many", "few"]);
});

test("completeness then freshness (listings only) then id", () => {
  const base = { ratingAvg: 4, reviewCount: 10 };
  const items = [
    { id: "z", kind: "listing", ...base, completeness: 0.5, publishedAt: "2026-11-15" },
    { id: "y", kind: "listing", ...base, completeness: 0.9, publishedAt: "2025-01-01" },
    { id: "x", kind: "listing", ...base, completeness: 0.9, publishedAt: "2026-11-10" },
    { id: "w", kind: "listing", ...base, completeness: 0.9, publishedAt: "2026-11-10" },
  ];
  assert.deepEqual(ids(rankDirectory(items, { now })), ["w", "x", "y", "z"]);
  const places = [{ id: "b", kind: "place", updatedAt: "2026-11-15" }, { id: "a", kind: "place", updatedAt: "2020-01-01" }];
  assert.equal(freshnessBucket(places[0], now), 0);
  assert.deepEqual(ids(rankDirectory(places, { now })), ["a", "b"]);
});

test("freshness is capped", () => {
  assert.equal(freshnessBucket({ id: "1", kind: "listing", publishedAt: "2026-11-16" }, now), 3);
  assert.equal(freshnessBucket({ id: "1", kind: "listing", publishedAt: "2026-10-30" }, now), 2);
  assert.equal(freshnessBucket({ id: "1", kind: "listing", publishedAt: "2020-01-01" }, now), 0);
  // Editing (updatedAt) never refreshes a listing: only the publication date counts.
  assert.equal(freshnessBucket({ id: "1", kind: "listing", publishedAt: "2020-01-01", updatedAt: "2026-11-16" }, now), 0);
});

test("price sorts with nulls last", () => {
  const items = [
    { id: "n", kind: "listing" },
    { id: "hi", kind: "listing", priceCrcNorm: 9_000_000 },
    { id: "lo", kind: "listing", priceCrcNorm: 4_000_000 },
  ];
  assert.deepEqual(ids(rankDirectory(items, { sort: "priceAsc", now })), ["lo", "hi", "n"]);
  const d = rankDirectory(items, { sort: "priceDesc", now });
  assert.deepEqual(ids(d), ["hi", "lo", "n"]);
  assert.ok(d[0].ranking_reason.includes("price_desc") && d[2].ranking_reason.includes("price_missing"));
});

test("distance and newest", () => {
  const items = [
    { id: "far", kind: "place", distanceKm: 9, createdAt: "2026-01-01" },
    { id: "near", kind: "place", distanceKm: 1, createdAt: "2025-01-01" },
    { id: "nod", kind: "place", createdAt: "2026-06-01" },
  ];
  assert.deepEqual(ids(rankDirectory(items, { sort: "distance", now })), ["near", "far", "nod"]);
  assert.deepEqual(ids(rankDirectory(items, { sort: "newest", now })), ["nod", "far", "near"]);
});

test("helpers", () => {
  assert.equal(normalizeText("  Café-Ñoño "), "cafe nono");
  assert.equal(textMatchScore("cafe", { name: "Café Tico" }), 2);
  assert.equal(textMatchScore("", { name: "x" }), 0);
  assert.equal(profileCompleteness({ id: "1", kind: "place", completenessFields: { a: "x", b: "", c: [1], d: null } }), 0.5);
});

test("ignores payment-like fields: input extras do not alter order", () => {
  const a = { id: "a", kind: "place", ratingAvg: 4, reviewCount: 5, isFeatured: false, tier: "free" };
  const b = { id: "b", kind: "place", ratingAvg: 4, reviewCount: 5, isFeatured: true, tier: "gold" };
  assert.deepEqual(ids(rankDirectory([b, a], { now })), ["a", "b"]);
});
