import { expect, test } from "playwright/test";
import { expectHealthyPage, gotoOK } from "./helpers";
import { canRunSeededRegression, regressionAdminClient } from "./seed";

type ProfessionalShape = {
  id: string;
  slug: string;
  business_name: string | null;
  professions: unknown;
  services: unknown;
  portfolio_items: unknown;
  verification_status: string | null;
  videoconsulta: boolean | null;
  coverage_country: boolean | null;
  availability_public: boolean | null;
  is_available: boolean | null;
  is_banned: boolean | null;
  profiles: { full_name?: string; avatar_url?: string | null; is_disabled?: boolean } | Array<{ full_name?: string; avatar_url?: string | null; is_disabled?: boolean }> | null;
};

function profileOf(row: ProfessionalShape) {
  return Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function representativeMatrix(rows: ProfessionalShape[]) {
  const predicates: Array<(row: ProfessionalShape) => boolean> = [
    () => true,
    (row) => Boolean(profileOf(row)?.avatar_url),
    (row) => !profileOf(row)?.avatar_url,
    (row) => row.verification_status === "verified",
    (row) => row.verification_status !== "verified",
    (row) => arrayLength(row.professions) > 1,
    (row) => arrayLength(row.professions) <= 1,
    (row) => arrayLength(row.services) > 2,
    (row) => arrayLength(row.portfolio_items) > 0,
    (row) => arrayLength(row.portfolio_items) === 0,
    (row) => Boolean(row.videoconsulta),
    (row) => Boolean(row.coverage_country),
    (row) => row.availability_public === false || row.is_available === false,
    (row) => `${row.business_name ?? ""}${profileOf(row)?.full_name ?? ""}`.length >= 35,
  ];
  const selected = new Map<string, ProfessionalShape>();
  for (const predicate of predicates) {
    const match = rows.find(predicate);
    if (match) selected.set(match.id, match);
  }
  return [...selected.values()];
}

test.describe("@seeded production-mirror professional data shapes", () => {
  test.skip(!canRunSeededRegression(), "Requires read access to the test mirror.");

  test("representative real profile shapes render in Spanish and English", async ({ page }) => {
    test.slow();
    const { data, error } = await regressionAdminClient()
      .from("professionals")
      .select("id,slug,business_name,professions,services,portfolio_items,verification_status,videoconsulta,coverage_country,availability_public,is_available,is_banned,profiles(full_name,avatar_url,is_disabled)")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const all = ((data ?? []) as unknown as ProfessionalShape[])
      .filter((row) => row.slug && !row.is_banned && !profileOf(row)?.is_disabled)
      .sort((left, right) => left.slug.localeCompare(right.slug));
    expect(all.length, "The production mirror should expose professional profiles").toBeGreaterThan(1);
    expect(all.some((row) => /^e2e-|^test-/i.test(row.slug))).toBe(false);

    const matrix = representativeMatrix(all);
    expect(matrix.length, "The mirror should cover several materially different profile shapes").toBeGreaterThanOrEqual(5);
    for (const professional of matrix) {
      for (const locale of ["es", "en"] as const) {
        await gotoOK(page, `/${locale}/profesionales/${professional.slug}`);
        const heading = page.locator("main h1").first();
        await expect(heading).toBeVisible();
        expect((await heading.innerText()).trim().length).toBeGreaterThan(2);
        await expect(page.locator("main")).not.toBeEmpty();
        await expectHealthyPage(page);
      }
    }
  });
});
