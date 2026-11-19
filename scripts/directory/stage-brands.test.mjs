// LOCAL PRO ONLY (brand pages 2026-11-17): brand rows from OSM tags and the generated SQL (offline).
import test from "node:test";
import assert from "node:assert/strict";
import { brandRows, brandSql, coreTokens, distinctiveKey, nameBrandRows } from "./stage-brands.mjs";

test("brand rows: one per reference, brand name required, Wikidata only as a Q-id", () => {
  const rows = brandRows([
    { type: "node", id: 2, tags: { brand: " Palí ", "brand:wikidata": "Q1064887", name: "Palí Desamparados" } },
    { type: "node", id: 2, tags: { brand: "Otro" } },
    { type: "way", id: 1, tags: { brand: "Musmanni", "brand:wikidata": "not-a-qid" } },
    { type: "node", id: 3, tags: { name: "Sin marca" } },
    { type: "node", id: 4, tags: { brand: "X" } },
    { type: "node", id: 5, tags: { brand: "Servicentro" } },
  ]);
  assert.deepEqual(rows, [
    { ref: "node/2", brand: "Palí", wikidata: "Q1064887" },
    { ref: "way/1", brand: "Musmanni" },
  ]);
});

test("brand SQL: staff functions only, parts of 5000, name matching last", () => {
  const rows = Array.from({ length: 5001 }, (_, i) => ({ ref: `node/${i}`, brand: "Cadena" }));
  const sql = brandSql(rows, "41e8d2b5-146c-4861-9c5b-e44ec0f69bd1", "abc");
  assert.equal(sql.match(/dir_brand_import\(/g).length, 2);
  assert.ok(sql.indexOf("dir_brand_match_names") > sql.lastIndexOf("dir_brand_import"));
  assert.doesNotMatch(sql, /\binsert into|\bupdate public\.|\bdelete\b/i);
  assert.throws(() => brandSql(rows, "nope", "abc"));
});

// 2026-11-17: chains without OSM brand tags, grouped by name inside one section.
const ph = (id, name, extra = {}) => ({ type: "node", id, tags: { amenity: "pharmacy", name, ...extra } });
const sm = (id, name, extra = {}) => ({ type: "node", id, tags: { shop: "supermarket", name, ...extra } });
const food = (id, name) => ({ type: "node", id, tags: { amenity: "restaurant", name } });
const groupOf = (res, key) => res.groups.find((g) => g.key === key);

test("name keys: accents, case, punctuation, section words and spaces folded", () => {
  assert.deepEqual(coreTokens("Farmacias FISCHEL"), ["fischel"]);
  assert.deepEqual(coreTokens("Farmacia Fischel – Curridabat"), ["fischel", "curridabat"]);
  assert.deepEqual(coreTokens("Don Gerardo Farmacia"), ["don", "gerardo"]);
  assert.deepEqual(coreTokens("Mega Súper"), ["mega", "super"], "a chain's own last word stays");
  assert.deepEqual(coreTokens("Súper Baterías"), ["super", "baterias"], "«Súper» is part of the name, never leaves a product word");
  assert.deepEqual(coreTokens("Mini Súper Girasol"), ["girasol"]);
  assert.deepEqual(coreTokens("Banco de Costa Rica"), ["banco", "de", "costa", "rica"], "section word + «de» is part of the name");
  assert.ok(distinctiveKey(["fischel"]) && distinctiveKey(["la", "bomba"]) && distinctiveKey(["mega", "super"]) && distinctiveKey(["super", "baterias"]));
  for (const k of [["super", "servicio"], ["super", "salon"], ["super", "economico"], ["central"], ["san", "jose"], ["la", "paz"], ["popular"], ["santa", "lucia"], ["don", "gerardo"], ["nicoya"], ["la"], ["sol"]])
    assert.equal(distinctiveKey(k), false, k.join(" "));
});

test("name groups: Fischel and Sucre variants group per section, typo joins, OSM operator confirms", () => {
  const els = [
    ph(1, "Farmacia Fischel", { operator: "Fischel" }), ph(2, "Farmacia Fischel"), ph(3, "Fischel"), ph(4, "Farmacias Fischel Curridabat"),
    ph(5, "Farmacia Fischel Plaza Rohrmoser"), ph(6, "FARMACIA FISCHEL"), ph(7, "Farmacia Fishel"), ph(8, "Farmacia Fishel"),
    ph(10, "Farmacia Sucre", { operator: "Farmacia Sucre S.A." }), ph(11, "Sucre"), ph(12, "Farmacia Sucre Pozos"), ph(13, "Farmacia Sucre"),
    ph(14, "Farmacia Sucre Santa Cruz"),
    ph(20, "Farmacia Fischel", { brand: "Fischel" }),
  ];
  const res = nameBrandRows(els);
  const fis = groupOf(res, "fischel");
  assert.equal(fis.branches, 9, "8 by name (typo «Fishel» included) + 1 tagged");
  assert.equal(fis.brand, "Fischel", "the OSM brand of tagged branches names the group");
  assert.equal(fis.nameRows, 8, "tagged branches go through brandRows, not twice");
  assert.equal(groupOf(res, "sucre").branches, 5);
  assert.equal(groupOf(res, "sucre").brand, "Farmacia Sucre", "most common exact name");
  for (const r of res.rows) assert.deepEqual(Object.keys(r).sort(), ["brand", "ref", "vertical", "via"]);
  assert.ok(res.rows.every((r) => r.via === "name" && r.vertical === "pharmacy"));
  assert.ok(!res.rows.some((r) => r.ref === "node/20"));
});

test("name groups: AM PM spellings join the tagged brand by name (name rows never carry a Wikidata id)", () => {
  const cv = (id, name, extra = {}) => ({ type: "node", id, tags: { shop: "convenience", name, ...extra } });
  const res = nameBrandRows([cv(1, "AM PM"), cv(2, "AM PM"), cv(3, "AMPM"), cv(4, "am/pm"), cv(5, "Ampm San Pedro"), cv(6, "ampm", { brand: "ampm", "brand:wikidata": "Q306960" })]);
  assert.deepEqual(res.rows.map((r) => [r.brand, r.wikidata]), Array(5).fill(["ampm", undefined]));
});

test("name groups: unrelated places with a shared generic word, other sections and small groups stay apart", () => {
  const res = nameBrandRows([
    // generic remainder / saint / toponym / person title, many times each: never a chain by name alone
    ...Array.from({ length: 12 }, (_, i) => ph(100 + i, "Farmacia Central")),
    ...Array.from({ length: 12 }, (_, i) => ph(200 + i, i % 2 ? "Farmacia San José" : "Farmacia San José Centro")),
    ...Array.from({ length: 12 }, (_, i) => sm(300 + i, "Supermercado La Paz")),
    ...Array.from({ length: 12 }, (_, i) => ph(400 + i, "Farmacia Don Gerardo")),
    ...Array.from({ length: 12 }, (_, i) => sm(500 + i, "Supermercado Popular")),
    // «Súper Baterías» ×2 does not pull unrelated «Baterías <apellido>» shops into a «baterías» key
    ...Array.from({ length: 10 }, (_, i) => ({ type: "node", id: 550 + i, tags: { shop: "car_parts", name: i < 2 ? "Súper Baterías" : `Baterías ${"ABCDEFGH"[i - 2]}` } })),
    // name-only evidence below 10 in a chain-prone section: not grouped
    ...Array.from({ length: 9 }, (_, i) => ph(600 + i, "Farmacia Galeno")),
    // name-only evidence outside chain-prone sections: «Soda María» ×20 is a coincidence
    ...Array.from({ length: 20 }, (_, i) => food(700 + i, "Soda María")),
    // confirmed by operator but below the minimum of 5
    ph(800, "Farmacia Ibarra", { operator: "Ibarra" }), ph(801, "Farmacia Ibarra"), ph(802, "Farmacia Ibarra"), ph(803, "Farmacia Ibarra Sur"),
    // a single exact name (+ a branch-qualified variant) never makes a key
    ph(900, "Farmacia Solís"), ph(901, "Farmacia Solís Norte"),
  ]);
  assert.deepEqual(res.groups, []);
  assert.deepEqual(res.rows, []);
});

test("name groups: the same key in two sections only groups the larger section", () => {
  const els = [
    ...Array.from({ length: 12 }, (_, i) => ph(i + 1, i % 3 ? "Farmacia La Bomba" : "La Bomba")),
    ...Array.from({ length: 11 }, (_, i) => ({ type: "node", id: 100 + i, tags: { amenity: "fuel", name: "La Bomba" } })),
    sm(200, "Súper Fischel"), sm(201, "Súper Fischel"),
    ...Array.from({ length: 10 }, (_, i) => ph(300 + i, "Farmacia Fischel")),
  ];
  const res = nameBrandRows(els);
  assert.deepEqual(res.groups.map((g) => [g.vertical, g.key, g.branches]), [["pharmacy", "fischel", 10], ["pharmacy", "labomba", 12]]);
  const other = new Set(["node/200", "node/201", ...Array.from({ length: 11 }, (_, i) => `node/${100 + i}`)]);
  assert.ok(!res.rows.some((r) => other.has(r.ref)), "fuel and grocery places untouched");
});

test("brand SQL: name rows ride the same staff import (staff/OSM assignments kept by the database)", () => {
  const sql = brandSql([{ ref: "node/1", brand: "Farmacia Fischel", via: "name", vertical: "pharmacy" }], "41e8d2b5-146c-4861-9c5b-e44ec0f69bd1", "abc");
  assert.match(sql, /dir_brand_import\(.*"via":"name","vertical":"pharmacy"/);
  assert.doesNotMatch(sql, /dir_brand_assign|"source"/);
});
