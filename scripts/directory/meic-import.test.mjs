// Run: node --test scripts/directory/
// LOCAL PRO ONLY (multivertical P3): offline MEIC importer (synthetic fixture; MEIC publishes no downloadable file).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { buildMeicPayloads, parsePrice, parseCsv, parsePresentation, gtinIsValid } = await import("./import-meic-prices.mjs");

const fx = "scripts/directory/fixtures/meic-sample/";
const load = async () => {
  const meta = JSON.parse(await readFile(fx + "meta.json", "utf8"));
  return { meta, catalog: JSON.parse(await readFile(fx + "catalog.json", "utf8")), places: JSON.parse(await readFile(fx + "places.json", "utf8")),
    csvText: await readFile(fx + meta.file, "utf8"), fileName: meta.file };
};

test("GTIN check digit (GS1)", () => {
  assert.equal(gtinIsValid("4006381333931"), true);
  assert.equal(gtinIsValid("4006381333932"), false);
  assert.equal(gtinIsValid("2000000000015"), true);
  assert.equal(gtinIsValid("12345"), false);
  assert.equal(gtinIsValid("96385074"), true, "GTIN-8");
});

test("Costa Rican price formats", () => {
  assert.equal(parsePrice("1.250,00"), 1250);
  assert.equal(parsePrice("₡1 190"), 1190);
  assert.equal(parsePrice("1480.50"), 1480.5);
  assert.equal(parsePrice("1,250.75"), 1250.75);
  assert.equal(parsePrice("1.250"), 1250);
  assert.equal(parsePrice("850,5"), 850.5);
  for (const bad of ["sin dato", "", "-5", "0", "1.2.3", "12,345,6"]) assert.equal(parsePrice(bad), null, bad);
});

test("presentation → unit", () => {
  assert.deepEqual(parsePresentation("500 g"), { unitBase: "g", unitQty: 500 });
  assert.deepEqual(parsePresentation("1,8 L"), { unitBase: "l", unitQty: 1.8 });
  assert.deepEqual(parsePresentation("946 ml"), { unitBase: "ml", unitQty: 946 });
  assert.deepEqual(parsePresentation("1 kg"), { unitBase: "kg", unitQty: 1 });
  assert.deepEqual(parsePresentation("10 tabletas"), { unitBase: "unit", unitQty: 10 });
  assert.equal(parsePresentation("bolsa"), null);
});

test("CSV: quotes, semicolons, CRLF, BOM", () => {
  assert.deepEqual(parseCsv('﻿a;b\r\n"x;1";"say ""hi"""\r\n'), [["a", "b"], ["x;1", 'say "hi"']]);
  assert.deepEqual(parseCsv("a,b\n1,2\n\n"), [["a", "b"], ["1", "2"]]);
  assert.throws(() => parseCsv('a\n"open'));
});

test("fixture: provenance, statuses, Rx never carries a price, deterministic", async () => {
  const input = await load();
  const built = buildMeicPayloads(input);
  assert.match(built.fileSha256, /^[a-f0-9]{64}$/);
  assert.equal(built.import.sourceUrl, input.meta.sourceUrl);
  assert.equal(built.import.publicationDate, "2026-11-02");
  assert.equal(built.import.fileName, "precios-sinteticos.csv");
  assert.deepEqual(built.counts, { to_record: 6, unmatched_place: 1, rx_refused: 1, invalid: 2 });
  const rx = built.import.rows.find((r) => r.status === "rx_refused");
  assert.equal("price" in rx, false, "Rx row has no price");
  assert.equal(built.catalog.some((c) => c.slug === "fixture-antibiotico-rx"), false, "Rx item is not catalogued");
  assert.equal(built.catalog.find((c) => c.kind === "medicine").rxRequired, false);
  assert.deepEqual(buildMeicPayloads(input), built, "same file → same payloads (idempotent)");
  const other = buildMeicPayloads({ ...input, csvText: input.csvText + "\n" });
  assert.notEqual(other.import.actionId, built.import.actionId, "another file → another action");
});

test("fixture: refuses bad metadata and catalogue", async () => {
  const input = await load();
  const bad = (patch) => assert.throws(() => buildMeicPayloads({ ...input, ...patch }));
  bad({ meta: { ...input.meta, source: "aresep" } });
  bad({ meta: { ...input.meta, sourceUrl: "http://insecure.example" } });
  bad({ meta: { ...input.meta, publicationDate: "2099-01-01" } });
  bad({ meta: { ...input.meta, publicationDate: "02/11/2026" } });
  bad({ catalog: { items: [{ ...input.catalog.items[0], gtin: "2000000000016" }] } });
  bad({ catalog: { items: [{ ...input.catalog.items[0], unitBase: "g", unitQty: 1 }] } }, "presentation 1 kg vs 1 g");
  bad({ csvText: "producto;comercio\nArroz;X\n" });
  bad({ fileName: "../etc/passwd" });
});
