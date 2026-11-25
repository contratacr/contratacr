import { expect, test } from "playwright/test";
import { INSURERS, insurerLabel } from "../../src/lib/data/insurers";
import { LANGUAGES, languageLabel, languageOfficialId } from "../../src/lib/data/languages";
import { OTRA_ASEGURADORA, OTRO_IDIOMA, limpiarTextoLibre, valorLibre } from "../../src/lib/data/otros-valores";

// El perfil ofrece TODOS los idiomas y aseguradoras; lo escrito a mano sale en el
// perfil de quien lo escribió y nunca en los filtros de búsqueda.
test.describe("idiomas y aseguradoras escritos a mano", () => {
  test("lo escrito se limpia y se guarda con su prefijo", () => {
    expect(limpiarTextoLibre("  Alemán  ")).toBe("Alemán");
    expect(limpiarTextoLibre("<b>Alemán</b>")).not.toMatch(/[<>]/);
    expect(limpiarTextoLibre("x")).toBe("");
    expect(limpiarTextoLibre("a".repeat(80))).toHaveLength(40);
    expect(valorLibre(OTRO_IDIOMA, "Alemán")).toBe("otro:Alemán");
    expect(valorLibre(OTRA_ASEGURADORA, "  ")).toBe("");
  });

  test("el perfil lee el texto sin prefijo", () => {
    expect(languageLabel("otro:Alemán", "es")).toBe("Alemán");
    expect(insurerLabel("otra:Seguros del Sur")).toBe("Seguros del Sur");
  });

  test("un valor escrito a mano nunca cuenta como idioma de la lista", () => {
    expect(languageOfficialId("otro:Alemán")).toBeNull();
    expect(languageOfficialId("Español")).toBe("es");
    expect(languageOfficialId("english")).toBe("en");
    expect(languageOfficialId("es")).toBe("es");
  });

  test("la lista oficial conserva todo lo que ya tenía y suma las aseguradoras comunes", () => {
    expect(LANGUAGES.map((l) => l.id)).toEqual(["es", "en", "fr", "pt", "zh", "ja", "lsr"]);
    const ids = new Set(INSURERS.map((i) => i.id));
    for (const id of ["adisa", "ins", "mapfre", "panamerican", "assa", "sagicor", "bupa", "aetna"]) expect(ids.has(id)).toBe(true);
    expect(ids.size).toBe(INSURERS.length);
  });
});
