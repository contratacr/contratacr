import test from "node:test";
import assert from "node:assert/strict";
const { detectVertical, matchVerticals, normalizeIntentText, VERTICAL_VOCABULARY } = await import("../../src/lib/directory/vertical-vocabulary.ts");

test("accent and case insensitive", () => {
  assert.equal(detectVertical("Gasolinera con DIÉSEL"), "gasolineras");
  assert.equal(detectVertical("farmacia 24 horas"), "farmacias");
  assert.equal(detectVertical("Droguería"), "farmacias");
  assert.equal(detectVertical("Súper cerca de mí"), "supermercados");
});

test("CR intents", () => {
  assert.equal(detectVertical("casado en una soda"), "restaurantes");
  assert.equal(detectVertical("pickup 4x4 usado"), "vehiculos");
  assert.equal(detectVertical("alquiler de apartamento en Escazú"), "inmuebles");
  assert.equal(detectVertical("lote en Guanacaste"), "inmuebles");
  assert.equal(detectVertical("parqueo público San José"), "parqueos");
  assert.equal(detectVertical("bomba de gasolina"), "gasolineras");
  assert.equal(detectVertical("Pali y Maxi Pali"), "supermercados");
});

test("English intents", () => {
  assert.equal(detectVertical("used car"), "vehiculos");
  assert.equal(detectVertical("house for rent"), "inmuebles");
  assert.equal(detectVertical("pharmacy near me"), "farmacias");
  assert.equal(detectVertical("gas station"), "gasolineras");
  assert.equal(detectVertical("parking"), "parqueos");
});

test("whole-word only and no match", () => {
  assert.equal(detectVertical("carrocería"), null); // "carro" must not match inside a longer word
  assert.equal(detectVertical(""), null);
  assert.equal(detectVertical("plomero"), null);
});

test("matches report score and terms; multi-vertical sorted", () => {
  const m = matchVerticals("carro y casa");
  assert.equal(m.length, 2);
  assert.ok(m.every((x) => x.score === 2));
  assert.deepEqual(m.map((x) => x.vertical), ["inmuebles", "vehiculos"]);
});

test("vocabulary sanity", () => {
  assert.equal(normalizeIntentText("  Ñandú-Café "), "nandu cafe");
  for (const [v, terms] of Object.entries(VERTICAL_VOCABULARY)) assert.ok(terms.length >= 8, v);
});
