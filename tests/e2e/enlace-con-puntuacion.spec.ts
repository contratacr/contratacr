import { expect, test } from "playwright/test";
import { claveDeTramo } from "../../src/lib/marketplace-url";

// Un enlace pegado en Facebook o WhatsApp a veces arrastra el punto, la coma o
// el paréntesis que venía después. Antes eso terminaba en «Página no
// encontrada» aunque el empleo seguía publicado (17-nov-2026).
test("el código del enlace se lee aunque traiga puntuación al final", () => {
  for (const tramo of ["electromecanico-ff72840e", "electromecanico-ff72840e.", "electromecanico-ff72840e)", "Electromecanico-FF72840E,", "electromecanico-ff72840e…", "ff72840e!"]) {
    expect(claveDeTramo(tramo)).toEqual({ prefijo: "ff72840e" });
  }
  expect(claveDeTramo("electromecanico-ff72840")).toEqual({});
  expect(claveDeTramo("0f1e2d3c-4b5a-4968-8776-655443322110.")).toEqual({ id: "0f1e2d3c-4b5a-4968-8776-655443322110" });
});
