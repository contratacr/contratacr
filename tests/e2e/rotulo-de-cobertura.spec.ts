import { readFileSync } from "node:fs";
import { expect, test } from "playwright/test";
import { baseDelProfesional, nombreDeLaBase, rotuloDeCobertura, type Base, type ClaveDeCobertura } from "../../src/lib/search/rotulo-de-cobertura";

// La tarjeta del buscador dice DÓNDE ESTÁ el profesional y, debajo, HASTA
// DÓNDE LLEGA, con los textos reales de messages/*.json.
function traductor(idioma: "es" | "en") {
  const textos = JSON.parse(readFileSync(`messages/${idioma}.json`, "utf8")).schedule as Record<ClaveDeCobertura, string>;
  return (clave: ClaveDeCobertura, valores: Record<string, string> = {}) =>
    textos[clave].replace(/\{(\w+)\}/g, (_, nombre: string) => valores[nombre] ?? "");
}
const es = traductor("es");
const cantones: Record<string, Base> = {
  "al-sr": { canton: "San Ramón", provincia: "Alajuela" },
  "li-po": { canton: "Pococí", provincia: "Limón" },
};
const buscar = (id: string) => cantones[id];

test.describe("rótulo de cobertura en la tarjeta", () => {
  test("la base sale del local; sin local, del perfil; sin nada, ninguna", () => {
    expect(baseDelProfesional([{ level: "provincia" }, { cantonId: "al-sr", receivesClients: true }], { canton: "Atenas", provincia: "Alajuela" }, buscar))
      .toEqual({ canton: "San Ramón", provincia: "Alajuela" });
    // Una zona a domicilio no es la base, ni un lugar de toda la provincia.
    expect(baseDelProfesional([{ cantonId: "al-sr", receivesClients: false }, { cantonId: "li-po", level: "provincia" }], { canton: "Atenas", provincia: "Alajuela" }, buscar))
      .toEqual({ canton: "Atenas", provincia: "Alajuela" });
    expect(baseDelProfesional([], { canton: "  " }, buscar)).toBeNull();
    expect(baseDelProfesional(undefined, {}, buscar)).toBeNull();
  });

  test("el nombre de la base no repite la provincia", () => {
    expect(nombreDeLaBase({ canton: "San Ramón", provincia: "Alajuela" })).toBe("San Ramón, Alajuela");
    expect(nombreDeLaBase({ canton: "Heredia", provincia: "Heredia" })).toBe("Heredia");
    expect(nombreDeLaBase({ canton: "Atenas", provincia: "" })).toBe("Atenas");
  });

  test("cada caso: lugar arriba, cobertura debajo", () => {
    const comun = { provincia: "Limón", cantonBuscado: "Talamanca", lugarBuscado: "Talamanca, Limón" };
    const sanRamon = { canton: "San Ramón", provincia: "Alajuela" };
    const heredia = { canton: "Heredia", provincia: "Heredia" };
    expect(rotuloDeCobertura(es, { ...comun, pais: false, base: sanRamon, enLinea: false }))
      .toEqual({ lugar: "San Ramón, Alajuela", nota: "Cubre toda la provincia de Limón" });
    expect(rotuloDeCobertura(es, { ...comun, pais: true, base: heredia, enLinea: false }))
      .toEqual({ lugar: "Heredia", nota: "Cubre todo el país" });
    expect(rotuloDeCobertura(es, { ...comun, pais: true, base: heredia, enLinea: true }))
      .toEqual({ lugar: "Heredia", nota: "Atiende en línea en todo el país" });
    // Sin base conocida: la cobertura misma es el lugar, sin nota repetida.
    expect(rotuloDeCobertura(es, { ...comun, pais: true, base: null, enLinea: true })).toEqual({ lugar: "Todo Costa Rica", nota: "" });
    expect(rotuloDeCobertura(es, { ...comun, pais: false, base: null, enLinea: false })).toEqual({ lugar: "Provincia de Limón", nota: "" });
    // Su base es el cantón buscado (con o sin tilde): es de ahí, sin nota.
    expect(rotuloDeCobertura(es, { ...comun, pais: true, base: { canton: "talamanca", provincia: "Limón" }, enLinea: false }))
      .toEqual({ lugar: "Talamanca, Limón", nota: "" });
  });

  test("inglés", () => {
    const en = traductor("en");
    const comun = { provincia: "Alajuela", lugarBuscado: "Alajuela", enLinea: false };
    expect(rotuloDeCobertura(en, { ...comun, pais: false, base: { canton: "Pococí", provincia: "Limón" } }))
      .toEqual({ lugar: "Pococí, Limón", nota: "Covers all of Alajuela province" });
    expect(rotuloDeCobertura(en, { ...comun, pais: true, base: null })).toEqual({ lugar: "All of Costa Rica", nota: "" });
  });
});
