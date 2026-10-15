import { expect, test } from "playwright/test";
import { ordenFinal, type SearchFiltersResolved, type SearchResult } from "@/lib/search/query-core";
import { compareByRating } from "@/lib/search/ranking";

function candidate(id: string, fields: Partial<SearchResult>): SearchResult {
  return { id, ratingAvg: 0, reviewCount: 0, isFeatured: false, ...fields } as SearchResult;
}

test("a named-place search puts verified professionals ahead when nobody has reviews", () => {
  const unverifiedLocal = candidate("unverified-local", {
    verificationStatus: "pending", cantonName: "Grecia", provinceName: "Alajuela", isFeatured: true,
  });
  const verifiedProvince = candidate("verified-province", {
    verificationStatus: "verified", provinceName: "Alajuela", coverage: { country: false, provincias: ["Alajuela"], cantones: [] },
  });
  const verifiedLocal = candidate("verified-local", {
    verificationStatus: "verified", cantonName: "Grecia", provinceName: "Alajuela",
  });
  // Named places can include map coordinates. They must not silently turn
  // "Mejor calificados" into a distance sort.
  const filters = { sortBy: "rating", selectedProvinceId: "al", selectedCantonId: "al-gr", nearLat: 10.07, nearLng: -84.31 } as SearchFiltersResolved;

  expect(ordenFinal([unverifiedLocal, verifiedProvince, verifiedLocal], filters).map(pro => pro.id))
    .toEqual(["verified-local", "verified-province", "unverified-local"]);
});

test("real reviews lead; verification resolves equal review evidence", () => {
  const verifiedNoReviews = candidate("verified-new", { verificationStatus: "verified" });
  const verifiedOneReview = candidate("verified-one", { verificationStatus: "verified", ratingAvg: 5, reviewCount: 1 });
  const unverifiedMany = candidate("unverified-many", { verificationStatus: "pending", ratingAvg: 5, reviewCount: 12 });
  const unverifiedLower = candidate("unverified-lower", { verificationStatus: "pending", ratingAvg: 4, reviewCount: 30 });
  const poorOneReview = candidate("poor-one", { verificationStatus: "pending", ratingAvg: 1, reviewCount: 1 });

  expect([verifiedNoReviews, verifiedOneReview, unverifiedMany, unverifiedLower, poorOneReview]
    .sort(compareByRating).map(pro => pro.id))
    .toEqual(["unverified-many", "verified-one", "unverified-lower", "verified-new", "poor-one"]);

  const verifiedSameRating = candidate("verified-same", { verificationStatus: "verified", ratingAvg: 4.8, reviewCount: 10 });
  const unverifiedSameRating = candidate("unverified-same", { verificationStatus: "pending", ratingAvg: 4.8, reviewCount: 10 });
  expect([unverifiedSameRating, verifiedSameRating].sort(compareByRating)[0].id).toBe("verified-same");
  expect(compareByRating(verifiedOneReview, verifiedSameRating)).toBeGreaterThan(0);
});

test("coordinates do not override rating unless nearby order is selected", () => {
  const verified = candidate("verified", { verificationStatus: "verified" });
  const unverified = candidate("unverified", { verificationStatus: "pending" });
  const filters = { sortBy: "rating", nearLat: 10.07, nearLng: -84.31 } as SearchFiltersResolved;
  expect(ordenFinal([unverified, verified], filters).map(pro => pro.id))
    .toEqual(["verified", "unverified"]);
  expect(ordenFinal([unverified, verified], { ...filters, sortBy: "cercania" }).map(pro => pro.id))
    .toEqual(["unverified", "verified"]);
});
