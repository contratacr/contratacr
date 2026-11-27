import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTags, osmMisHit } from "./stage-import.mjs";
import { cleanupPlan, derivedUuid, misHitCandidates } from "./osm-reclassify-cleanup.mjs";

test("customs and bonded warehouses tagged as shops are never listed", () => {
  assert.equal(classifyTags({ shop: "wholesale", name: "A169 - DEPOSITO ADUANERO ENCASPI S.A." }), null);
  assert.equal(classifyTags({ shop: "wholesale", name: "TICA A238" }), null);
  assert.equal(classifyTags({ shop: "wholesale", name: "Aeropost - Almacén Fiscal A238", "Tica Code": "A238" }), null);
  assert.equal(classifyTags({ shop: "massage", name: "Tica Massage" })?.vertical, "beauty");
  // A public customs office and a café named after the customs house keep their sections.
  assert.equal(classifyTags({ office: "government", name: "Aduana Puntarenas" })?.vertical, "government");
  assert.equal(classifyTags({ amenity: "cafe", name: "Café Aduana" })?.vertical, "cafe_bar");
});

test("wholesale: food stays in supermarkets, the rest moves or is skipped", () => {
  assert.equal(classifyTags({ shop: "wholesale", name: "PriceSmart" })?.vertical, "grocery");
  assert.equal(classifyTags({ shop: "wholesale", name: "La Esperanza", wholesale: "general" })?.vertical, "grocery");
  assert.equal(classifyTags({ shop: "wholesale", name: "TECTEL MAYORISTA", wholesale: "electronics,_cctv,_security" }), null);
  assert.deepEqual(classifyTags({ shop: "wholesale", name: "Distribuidora y Muebles Don Bosco" }), { vertical: "retail", attributes: { kind: "furniture" } });
  assert.deepEqual(classifyTags({ shop: "wholesale", name: "Europartes Vega" }), { vertical: "auto_services", attributes: { kind: "parts" } });
});

test("supermarket tags on butchers, fishmongers and bazaars; offices, couriers and associations", () => {
  assert.deepEqual(classifyTags({ shop: "supermarket", name: "Bodega de pescaderia" }), { vertical: "food_shop", attributes: { kind: "seafood" } });
  assert.equal(classifyTags({ shop: "supermarket", name: "Bazar Eilyn" })?.vertical, "retail");
  assert.equal(classifyTags({ shop: "supermarket", name: "Súper y Carnicería Blancos" })?.vertical, "grocery");
  assert.equal(classifyTags({ amenity: "post_office", name: "DHL" }), null);
  assert.equal(classifyTags({ amenity: "post_office", name: "Correos de Costa Rica - Uruca" })?.vertical, "government");
  assert.equal(classifyTags({ amenity: "post_office", name: "Sucursal Uruca", operator: "Correos de Costa Rica" })?.vertical, "government");
  assert.equal(classifyTags({ shop: "mall", name: "Oficentro Las Torres" }), null);
  assert.equal(classifyTags({ shop: "mall", name: "Multiplaza Escazú" })?.vertical, "mall");
  assert.equal(classifyTags({ amenity: "fast_food", name: "QSR Oficinas Centrales" }), null);
  assert.equal(classifyTags({ amenity: "college", name: "Colegio de Médicos y Cirujanos" }), null);
  assert.equal(classifyTags({ amenity: "school", name: "Colegio de Santa Ana" })?.vertical, "education");
  assert.equal(osmMisHit({ amenity: "restaurant", name: "Soda La Oficina" }), null);
});

test("plan: hide published, move unclaimed, keep claimed, skip what is already done", () => {
  const cands = misHitCandidates([
    { type: "way", id: 1, tags: { shop: "wholesale", name: "TICA A101" } },
    { type: "way", id: 2, tags: { shop: "supermarket", name: "Bazar X" } },
    { type: "way", id: 3, tags: { amenity: "post_office", name: "DHL" } },
    { type: "way", id: 4, tags: { shop: "supermarket", name: "Bazar Y" } },
    { type: "way", id: 5, tags: { shop: "supermarket", name: "Super Z" } },
  ]);
  assert.equal(cands.length, 4);
  const p = (id, vertical_id, status = "published", claim_status = "unclaimed") => ({ id, slug: id, name: id, vertical_id, status, claim_status, revision: 1 });
  const plan = cleanupPlan(cands, new Map([["way/1", p("a", "grocery")], ["way/2", p("b", "grocery")], ["way/3", p("c", "government", "hidden")], ["way/4", p("d", "retail")]]));
  assert.deepEqual(plan.map((a) => a.decision), ["hide", "move"]);
  assert.equal(cleanupPlan(cands, new Map([["way/2", p("b", "grocery", "published", "claimed")]]))[0].decision, "claimed_kept");
  assert.equal(derivedUuid("x"), derivedUuid("x"));
  assert.match(derivedUuid("x"), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
