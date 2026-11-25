import { readFileSync } from "node:fs";
import { expect, test } from "playwright/test";
import { rotuloDeCobertura, type ClaveDeCobertura } from "../../src/lib/search/rotulo-de-cobertura";

// Con zona buscada, quien cubre la provincia o el país se lee con el lugar
// buscado, sin palabras extra; sin zona, «Atiende en todo el país». Textos reales
// de messages/*.json.
function traductor(idioma: "es" | "en") {
  const textos = JSON.parse(readFileSync(`messages/${idioma}.json`, "utf8")).schedule as Record<ClaveDeCobertura, string>;
  return (clave: ClaveDeCobertura) => textos[clave];
}

test.describe("rótulo de cobertura en la tarjeta", () => {
  test("con zona buscada se lee el lugar buscado", () => {
    const es = traductor("es");
    expect(rotuloDeCobertura(es, { lugarBuscado: "Atenas, Alajuela" })).toBe("Atenas, Alajuela");
    expect(rotuloDeCobertura(es, { lugarBuscado: "Alajuela" })).toBe("Alajuela");
  });

  test("sin zona buscada, el país", () => {
    expect(rotuloDeCobertura(traductor("es"), {})).toBe("Atiende en todo el país");
    expect(rotuloDeCobertura(traductor("es"), { lugarBuscado: "  " })).toBe("Atiende en todo el país");
    expect(rotuloDeCobertura(traductor("en"), {})).toBe("Serves all of Costa Rica");
  });

  test("sin palabras extra: ni «A domicilio» ni «Cubre la zona»", () => {
    for (const idioma of ["es", "en"] as const) {
      const textos = JSON.parse(readFileSync(`messages/${idioma}.json`, "utf8")).schedule as Record<string, string>;
      expect(textos.aDomicilio).toBeUndefined();
      expect(textos.cubreLaZona).toBeUndefined();
    }
  });
});
