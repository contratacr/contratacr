import { expect, test } from "playwright/test";
import { computeSearchAreas, hasBaseCanton, primaryArea, withHomeServiceScope } from "../../src/lib/location";
import { computeCompletion } from "../../src/lib/professional-completion";

test("@contract province or national coverage cannot replace the base canton", () => {
  const province = { provinciaId: "al", level: "provincia" };
  const country = { level: "country" as const };
  const base = { provinciaId: "al", cantonId: "al-at", level: "canton" };
  expect(hasBaseCanton([province, country])).toBe(false);
  expect(hasBaseCanton([province, country, base])).toBe(true);
  expect(primaryArea([province, base])).toEqual({ provinciaId: "al", cantonId: "al-at" });
  expect(computeSearchAreas([province, base], [country])).toEqual({
    provincias: ["al"], cantones: ["al-at"], coverageProvincias: ["al"], coverageCountry: true,
  });
  expect(computeCompletion({ workplaces: [province, country] }).items.find(item => item.key === "location")?.done).toBe(false);
  expect(computeCompletion({ workplaces: [base] }).items.find(item => item.key === "location")?.done).toBe(true);
});

test("@contract changing home coverage keeps bases and removes redundant broad scopes", () => {
  const base = { id: "base", name: "Atenas", address: "Local", provinciaId: "al", cantonId: "al-at", level: "canton" as const, lat: 9.98, lng: -84.38 };
  const labels = { country: "Todo Costa Rica", province: () => "Toda Alajuela" };
  const province = withHomeServiceScope([base], "province", labels);
  expect(province.filter(w => w.level === "provincia")).toHaveLength(1);
  const country = withHomeServiceScope(province, "country", labels);
  expect(country.filter(w => w.level === "country")).toHaveLength(1);
  expect(country.some(w => w.level === "provincia")).toBe(false);
  expect(withHomeServiceScope(country, "cantons", labels)).toEqual([base]);
  expect(withHomeServiceScope(country, "province", labels)).toEqual(province);
});
