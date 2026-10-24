import { expect, test } from "playwright/test";
import { formatServicePrice, primaryPricingLabel, splitPricingLabel } from "../../src/lib/pricing";

test("@contract search prices show a localized minimum while consultation remains available", () => {
  expect(primaryPricingLabel([{ id: "p", type: "por_proyecto", amount: 25000 }], null, "es"))
    .toBe("Desde ₡25.000 /proyecto I.V.A.I.");
  expect(primaryPricingLabel([{ id: "p", type: "por_hora", amount: 15000 }], null, "en"))
    .toBe("From ₡15.000 /hour I.V.A.I.");
  expect(primaryPricingLabel([{ id: "p", type: "a_convenir" }], null, "es")).toBe("Consultar precio");
  expect(primaryPricingLabel([], null, "en")).toBe("Ask for price");
  expect(primaryPricingLabel([], 15000, "es")).toBe("Desde ₡15.000 /hora I.V.A.I.");
  expect(formatServicePrice(25000, "por_proyecto", "es")).toBe("₡25.000 /proyecto I.V.A.I.");
  expect(splitPricingLabel(primaryPricingLabel([], 15000, "es"))).toMatchObject({ amount: "Desde ₡15.000", unit: "/hora" });
});
