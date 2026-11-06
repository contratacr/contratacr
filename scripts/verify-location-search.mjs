import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

const modules = new Map();
function loadModule(path) {
  if (modules.has(path)) return modules.get(path);
  const exports = {};
  modules.set(path, exports);
  const source = readFileSync(new URL(`../src/${path}.ts`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, console, setTimeout, clearTimeout, URL, URLSearchParams,
    require: (name) => {
      assert.ok(name.startsWith("@/"), `Unexpected dependency: ${name}`);
      return loadModule(name.slice(2));
    },
  });
  return exports;
}
const { PROVINCES } = loadModule("lib/data/cr-geography");
const { DISTRICTS, PLACE_ALIASES } = loadModule("lib/data/cr-districts");
const { normalizeText } = loadModule("lib/data/categories");
const { searchLocations, resolveLocation, locationSuggestionKey, locationSuggestionContext, allLocationSuggestions } = loadModule("lib/data/location-search");
const { rutaDeBusqueda } = loadModule("lib/buscar-url");

test("every catalogue name preserves its target and has unique suggestion identities", () => {
  for (const place of [...DISTRICTS, ...PLACE_ALIASES]) {
    const matches = searchLocations(place.name, 1000);
    assert.equal(new Set(matches.map(locationSuggestionKey)).size, matches.length, place.name);
    assert.ok(matches.some(s => normalizeText(s.label) === normalizeText(place.name) && s.id === place.cantonId), place.name);
    assert.ok(PROVINCES.some(p => p.cantons.some(c => c.id === place.cantonId)), place.name);
  }
  assert.equal(allLocationSuggestions().length, 91);
});

test("capital names keep separate province and canton scopes without repeated district rows", () => {
  for (const [label, province, canton] of [["Puntarenas", "pu", "pu-pu"], ["Alajuela", "al", "al-al"], ["Heredia", "he", "he-he"], ["Limón", "li", "li-li"]]) {
    const exact = searchLocations(label).filter(s => s.label === label);
    assert.equal(exact.length, 2, label);
    assert.equal(exact[0].id, province);
    assert.equal(exact[1].id, canton);
    assert.equal(locationSuggestionContext(exact[0]), "");
    assert.equal(locationSuggestionContext(exact[1]), label);
    assert.equal(locationSuggestionContext(exact[0], "en"), "");
  }
  assert.equal(searchLocations("Cahuita").filter(s => s.label === "Cahuita").length, 1);
});

test("homonyms and different districts sharing a canton remain distinct", () => {
  const matches = searchLocations("San Rafael", 1000).filter(s => s.label === "San Rafael");
  assert.ok(matches.length > 5);
  assert.ok(matches.some(s => s.id === "he-sr" && s.kind === "canton"));
  assert.ok(matches.some(s => s.id === "sj-es" && s.kind === "district"));
  const sameCanton = searchLocations("San", 1000).filter(s => s.id === "he-ba");
  assert.ok(sameCanton.length > 1);
  assert.equal(new Set(sameCanton.map(locationSuggestionKey)).size, sameCanton.length);
});

test("new cantons and compatible spellings resolve to current canonical routes", () => {
  for (const [query, id, suffix] of [["Monte Verde", "pu-mv", "monteverde"], ["Monteverde", "pu-mv", "monteverde"], ["Puerto Jiménez", "pu-pj", "puerto-jimenez"]]) {
    const place = resolveLocation(query);
    assert.equal(place.id, id);
    assert.equal(searchLocations(query).filter(s => s.id === id).length, 1);
    const url = rutaDeBusqueda(new URLSearchParams({provincia: place.provinceId, canton: place.id}));
    assert.ok(url.endsWith(`/puntarenas/${suffix}`), url);
  }
  assert.equal(locationSuggestionKey(resolveLocation("Los Ángeles")), locationSuggestionKey(searchLocations("Ángeles").find(s => s.id === "he-sr")));
  assert.equal(resolveLocation("Los Ángeles").id, "he-sr");
});

test("nine DTA 2025 additions resolve by name, accents and canton", () => {
  for (const [name, id] of [["Quitirrisí","sj-mo"],["La Amistad","sj-pm"],["Birrisito","ca-pa"],["La Victoria","ca-ji"],["Puente Salas","he-ba"],["Matambú","gu-ho"],["Gutiérrez Braun","pu-cc"],["Lagunillas","pu-ga2"],["Reventazón","li-si"]]) {
    assert.equal(resolveLocation(normalizeText(name)).id, id, name);
    assert.equal(resolveLocation(name).kind, "district");
    const location = resolveLocation(name);
    const province = PROVINCES.find(p => p.id === location.provinceId);
    const canton = province.cantons.find(c => c.id === id);
    assert.equal(locationSuggestionContext(location, "en"), `${canton.name}, ${province.name}`);
  }
  assert.equal(resolveLocation("Rohrmoser").kind, "place");
  assert.equal(locationSuggestionContext(resolveLocation("Rohrmoser")), "San José, San José");
});

test("2026 districts and familiar names use their current canton, never a province fallback", () => {
  for (const [query, canton] of [["Ciudad Colón", "sj-mo"], ["Colon", "sj-mo"], ["Villa Colón", "sj-mo"], ["Pijije", "gu-ba"], ["Cabagra", "pu-bv"], ["Pejivalle", "sj-pm"], ["Río Cuarto", "al-rc"], ["Vázquez de Coronado", "sj-vb"]]) {
    const place = resolveLocation(query);
    assert.equal(place.id, canton, query);
    assert.equal(place.type, "canton", query);
  }
  assert.equal(resolveLocation("Ciudad Colón").label, "Ciudad Colón");
  assert.equal(locationSuggestionContext(resolveLocation("Ciudad Colón")), "Mora, San José");
  assert.ok(!searchLocations("Río Cuarto").some(place => place.id === "al-gr"));
  assert.equal(searchLocations("Lugar que no existe 987654").length, 0);
  assert.deepEqual(searchLocations("San"), searchLocations("San", 10000));
});
