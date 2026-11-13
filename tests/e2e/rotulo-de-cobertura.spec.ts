import { readFileSync } from "node:fs";
import { expect, test } from "playwright/test";
import { baseDelProfesional, rotuloDeCobertura, type ClaveDeCobertura } from "../../src/lib/search/rotulo-de-cobertura";

// La tarjeta del buscador dice de dónde viene el profesional y cómo llega, con
// los textos reales de messages/*.json.
function traductor(idioma: "es" | "en") {
  const textos = JSON.parse(readFileSync(`messages/${idioma}.json`, "utf8")).schedule as Record<ClaveDeCobertura, string>;
  return (clave: ClaveDeCobertura, valores: Record<string, string> = {}) =>
    textos[clave].replace(/\{(\w+)\}/g, (_, nombre: string) => valores[nombre] ?? "");
}
const es = traductor("es");
const nombres: Record<string, string> = { "al-sr": "San Ramón", "li-gu": "Pococí", "he-he": "Heredia" };
const nombre = (id: string) => nombres[id];

test.describe("rótulo de cobertura en la tarjeta", () => {
  test("la base sale del local; sin local, del perfil; sin nada, vacía", () => {
    expect(baseDelProfesional([{ level: "provincia" }, { cantonId: "al-sr", receivesClients: true }], "Atenas", nombre)).toBe("San Ramón");
    // Una zona a domicilio no es la base, ni un lugar de toda la provincia.
    expect(baseDelProfesional([{ cantonId: "al-sr", receivesClients: false }, { cantonId: "li-gu", level: "provincia" }], "Atenas", nombre)).toBe("Atenas");
    expect(baseDelProfesional([], "  ", nombre)).toBe("");
    expect(baseDelProfesional(undefined, null, nombre)).toBe("");
  });

  test("cada caso de la tabla", () => {
    const comun = { provincia: "Alajuela", cantonBuscado: "Atenas", lugarBuscado: "Atenas, Alajuela" };
    expect(rotuloDeCobertura(es, { ...comun, pais: false, base: "San Ramón", enLinea: false })).toBe("Desde San Ramón · a domicilio");
    expect(rotuloDeCobertura(es, { ...comun, pais: true, base: "Heredia", enLinea: false })).toBe("Desde Heredia · todo el país");
    expect(rotuloDeCobertura(es, { ...comun, pais: true, base: "Heredia", enLinea: true })).toBe("En línea · todo el país");
    expect(rotuloDeCobertura(es, { ...comun, pais: true, base: "", enLinea: false })).toBe("Cubre todo el país");
    expect(rotuloDeCobertura(es, { ...comun, pais: false, base: "", enLinea: false })).toBe("Cubre toda Alajuela");
    // Su base es el cantón buscado (con o sin tilde): se dice el lugar, no la cobertura.
    expect(rotuloDeCobertura(es, { ...comun, pais: true, base: "atenas", enLinea: false })).toBe("Atenas, Alajuela");
    // Buscando solo la provincia también se dice desde dónde viene.
    expect(rotuloDeCobertura(es, { provincia: "Limón", lugarBuscado: "Limón", pais: false, base: "Pococí", enLinea: false })).toBe("Desde Pococí · a domicilio");
  });

  test("inglés", () => {
    const en = traductor("en");
    const comun = { provincia: "Alajuela", lugarBuscado: "Alajuela", enLinea: false };
    expect(rotuloDeCobertura(en, { ...comun, pais: true, base: "Heredia" })).toBe("From Heredia · nationwide");
    expect(rotuloDeCobertura(en, { ...comun, pais: false, base: "" })).toBe("Covers all of Alajuela");
  });
});
