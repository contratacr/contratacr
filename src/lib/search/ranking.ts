/** A few reviews should not make a 5.0 look stronger than a sustained 4.8.
 * Three neutral (4.0) prior reviews keep small samples from jumping to the top.
 * Verification breaks ties; it never erases credible client ratings.
 */
export type RatingSignals = {
  ratingAvg?: number | null;
  reviewCount?: number | null;
  verificationStatus?: string | null;
};

export function compareByRating(a: RatingSignals, b: RatingSignals): number {
  const aCount = Math.max(0, a.reviewCount ?? 0);
  const bCount = Math.max(0, b.reviewCount ?? 0);
  const credibleRating = (person: RatingSignals, count: number) =>
    ((Math.max(0, Math.min(5, person.ratingAvg ?? 0)) * count) + 4 * 3) / (count + 3);
  return credibleRating(b, bCount) - credibleRating(a, aCount) ||
    bCount - aCount ||
    Number(b.verificationStatus === "verified") - Number(a.verificationStatus === "verified");
}
