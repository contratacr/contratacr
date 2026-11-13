import { readFileSync } from "node:fs";
import { expect, test } from "playwright/test";
import { rotuloDeCobertura, type ClaveDeCobertura } from "../../src/lib/search/rotulo-de-cobertura";

// Con zona buscada, quien no está en ella pero la cubre se lee «Provincia de X»
// o «Todo Costa Rica», con los textos reales de messages/*.json.
function traductor(idioma: "es" | "en") {
  const textos = JSON.parse(readFileSync(`messages/${idioma}.json`, "utf8")).schedule as Record<ClaveDeCobertura, string>;
  return (clave: ClaveDeCobertura, valores: Record<string, string> = {}) =>
    textos[clave].replace(/\{(\w+)\}/g, (_, nombre: string) => valores[nombre] ?? "");
}

test.describe("rótulo de cobertura en la tarjeta", () => {
  test("provincia y país", () => {
    const es = traductor("es");
    expect(rotuloDeCobertura(es, { pais: false, provincia: "Heredia" })).toBe("Provincia de Heredia");
    expect(rotuloDeCobertura(es, { pais: true, provincia: "Heredia" })).toBe("Todo Costa Rica");
    // Sin provincia conocida no se inventa una: queda el país.
    expect(rotuloDeCobertura(es, { pais: false, provincia: " " })).toBe("Todo Costa Rica");
  });

  test("inglés", () => {
    const en = traductor("en");
    expect(rotuloDeCobertura(en, { pais: false, provincia: "Heredia" })).toBe("Heredia province");
    expect(rotuloDeCobertura(en, { pais: true, provincia: "" })).toBe("All of Costa Rica");
  });
});
