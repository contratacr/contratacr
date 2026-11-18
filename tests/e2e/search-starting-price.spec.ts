import { expect, test } from "playwright/test";
import { formatServicePrice, primaryPricingLabel, splitPricingLabel, unidadParaCategoria, unidadesDeTarifa, unidadSugerida } from "../../src/lib/pricing";

test("@contract search prices show a localized minimum while consultation remains available", () => {
  expect(primaryPricingLabel([{ id: "p", type: "por_proyecto", amount: 25000 }], null, "es"))
    .toBe("Desde ₡25.000 I.V.A.I.");
  expect(primaryPricingLabel([{ id: "p", type: "por_hora", amount: 15000 }], null, "en"))
    .toBe("From ₡15.000 /hour I.V.A.I.");
  expect(primaryPricingLabel([{ id: "p", type: "a_convenir" }], null, "es")).toBe("Consultar precio");
  expect(primaryPricingLabel([], null, "en")).toBe("Ask for price");
  expect(primaryPricingLabel([], 15000, "es")).toBe("Desde ₡15.000 /hora I.V.A.I.");
  expect(formatServicePrice(25000, "por_proyecto", "es")).toBe("₡25.000 I.V.A.I.");
  // Unidades viejas: se leen como precio por trabajo, sin "Paquete:" ni "/día".
  expect(formatServicePrice(25000, "paquete", "es")).toBe("₡25.000 I.V.A.I.");
  expect(formatServicePrice(25000, "por_dia", "es")).toBe("₡25.000 I.V.A.I.");
  expect(formatServicePrice(20000, "por_consulta", "es")).toBe("₡20.000 /consulta I.V.A.I.");
  expect(splitPricingLabel(primaryPricingLabel([], 15000, "es"))).toMatchObject({ amount: "Desde ₡15.000", unit: "/hora" });
});

test("@contract only two price units are offered, suggested by service", () => {
  expect(unidadesDeTarifa("electricidad")).toEqual(["por_proyecto", "por_hora"]);
  expect(unidadesDeTarifa("psicologia")).toEqual(["por_consulta", "por_hora"]);
  expect(unidadesDeTarifa("tutorias")).toEqual(["por_hora", "por_proyecto"]);
  expect(unidadSugerida(undefined)).toBe("por_proyecto");
  expect(unidadParaCategoria("paquete", "fotografia")).toBe("por_proyecto");
  expect(unidadParaCategoria("por_dia", "limpieza")).toBe("por_proyecto");
  expect(unidadParaCategoria("por_proyecto", "psicologia")).toBe("por_consulta");
  expect(unidadParaCategoria("por_consulta", "electricidad")).toBe("por_proyecto");
  expect(unidadParaCategoria("por_hora", "electricidad")).toBe("por_hora");
  expect(unidadParaCategoria("a_convenir", "tutorias")).toBe("por_hora");
});
