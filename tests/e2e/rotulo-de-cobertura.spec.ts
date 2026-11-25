import { readFileSync } from "node:fs";
import { expect, test } from "playwright/test";
import { marcaDeCobertura, rotuloDeCobertura, type ClaveDeCobertura } from "../../src/lib/search/rotulo-de-cobertura";

// Con zona buscada, quien cubre la provincia o el país se lee con el lugar
// buscado y una marca corta; sin zona, «Atiende en todo el país». Textos reales
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

  test("la marca: domicilio solo si está encendido de verdad", () => {
    const es = traductor("es");
    expect(es(marcaDeCobertura({ domicilio: true, porVideo: false }))).toBe("A domicilio");
    expect(es(marcaDeCobertura({ domicilio: false, porVideo: false }))).toBe("Cubre la zona");
    expect(es(marcaDeCobertura({ domicilio: true, porVideo: true }))).toBe("Videoconsulta");
    expect(traductor("en")(marcaDeCobertura({ domicilio: false, porVideo: false }))).toBe("Covers the area");
  });
});
