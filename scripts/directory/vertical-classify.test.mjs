// Run: node --test scripts/directory/
// LOCAL PRO ONLY (2026-11-17, eleven new place sections): OSM tag → vertical mapping of stage-import.mjs (priority,
// exclusions, person names, fuel-station shops, nearby duplicates). Pure: no network, no database.
import test from "node:test";
import assert from "node:assert/strict";
import { classifyTags, verticalFromTags, personNameCheck, isFuelShopName, dedupeNearby, dropNearFuel, parseImport, isGenericName, isGenericParkingName, dropOutsideAreas, loadAdminAreas } from "./stage-import.mjs";

test("cafés, bakeries and bars leave restaurants; restaurants with a bar or bakery stay restaurants", () => {
  assert.deepEqual(classifyTags({ amenity: "cafe" }), { vertical: "cafe_bar", attributes: { kind: "cafe" } });
  assert.deepEqual(classifyTags({ shop: "bakery" }), { vertical: "cafe_bar", attributes: { kind: "bakery" } });
  assert.deepEqual(classifyTags({ amenity: "bar" }), { vertical: "cafe_bar", attributes: { kind: "bar" } });
  assert.equal(verticalFromTags({ amenity: "restaurant", shop: "bakery" }), "restaurant");
  assert.equal(verticalFromTags({ amenity: "restaurant", bar: "yes" }), "restaurant");
  assert.equal(verticalFromTags({ amenity: "cafe", shop: "bakery" }), "cafe_bar");
});

test("priority: lodging over its restaurant, pharmacy never health, dealer over workshop", () => {
  assert.deepEqual(classifyTags({ tourism: "hotel", amenity: "restaurant" }), { vertical: "lodging", attributes: { kind: "hotel" } });
  assert.equal(classifyTags({ tourism: "chalet", name: "Villa Mar" }).attributes.kind, "vacation_rental");
  assert.equal(classifyTags({ tourism: "apartment" }).attributes.kind, "vacation_rental");
  assert.equal(classifyTags({ tourism: "chalet", name: "Cabinas El Sol" }).attributes.kind, "cabins");
  assert.equal(verticalFromTags({ amenity: "pharmacy", healthcare: "pharmacy" }), "pharmacy");
  assert.equal(verticalFromTags({ healthcare: "pharmacy" }), "pharmacy");
  assert.equal(verticalFromTags({ shop: "car", service: "repair" }), "vehicle_dealer");
  assert.deepEqual(classifyTags({ shop: "car_parts" }), { vertical: "auto_services", attributes: { kind: "parts" } });
  assert.deepEqual(classifyTags({ amenity: "vehicle_inspection" }), { vertical: "auto_services", attributes: { kind: "inspection" } });
});

test("exclusions: locksmith, fitness stations, adult venues, cosmetics, viewpoints, plain sports centres", () => {
  for (const tags of [{ shop: "locksmith" }, { leisure: "fitness_station" }, { amenity: "stripclub" }, { amenity: "nightclub" }, { shop: "erotic" },
    { amenity: "bar", adult: "yes" }, { shop: "cosmetics" }, { tourism: "viewpoint" }, { leisure: "sports_centre", sport: "soccer" }, { healthcare: "blood_donation" }])
    assert.equal(classifyTags(tags), null, JSON.stringify(tags));
  assert.equal(classifyTags({ leisure: "sports_centre", sport: "fitness" }).vertical, "fitness");
  assert.equal(classifyTags({ leisure: "sports_centre", name: "Gimnasio Municipal" }).vertical, "fitness");
});

test("health kinds and the public-service flag; banks keep the ATM as an attribute", () => {
  assert.deepEqual(classifyTags({ amenity: "clinic", healthcare: "clinic", "operator:type": "public" }), { vertical: "health", attributes: { kind: "clinic", publicService: true } });
  assert.equal(classifyTags({ amenity: "doctors", name: "EBAIS Centro" }).attributes.publicService, true);
  assert.equal(classifyTags({ healthcare: "laboratory" }).attributes.kind, "laboratory");
  assert.equal(classifyTags({ shop: "optician" }).attributes.kind, "optician");
  assert.deepEqual(classifyTags({ amenity: "bank", atm: "yes", operator: "BCR" }), { vertical: "banking", attributes: { kind: "bank", atm: true, operator: "BCR" } });
  assert.equal(classifyTags({ amenity: "atm" }).attributes.kind, "atm");
});

test("corner stores: convenience/general/kiosk or a pulpería name; never a supermarket or a fuel-station shop", () => {
  assert.deepEqual(classifyTags({ shop: "convenience", name: "Pulpería La Esquina" }), { vertical: "convenience", attributes: { kind: "pulperia" } });
  assert.equal(classifyTags({ shop: "convenience", name: "Mini Super El Sol" }).attributes.kind, "minisuper");
  assert.equal(classifyTags({ shop: "yes", name: "Abastecedor Don Juan" }).vertical, "convenience");
  assert.equal(verticalFromTags({ shop: "supermarket", name: "Minisuper Los Ángeles" }), "grocery");
  assert.ok(isFuelShopName("Delta Tienda", null) && isFuelShopName("Uno", null) && isFuelShopName("x", "Mobil Mart") && isFuelShopName("Servicentro El Carmen", null));
  assert.ok(!isFuelShopName("Abastecedor El Uno", null) && !isFuelShopName("AM PM", null));
  const data = JSON.stringify({ elements: [
    { type: "node", id: 1, lat: 9.93, lon: -84.08, tags: { shop: "convenience", name: "Pulpería Uno Más" } },
    { type: "node", id: 2, lat: 9.94, lon: -84.08, tags: { shop: "convenience", name: "Delta" } },
    { type: "node", id: 3, lat: 9.95, lon: -84.08, tags: { shop: "supermarket", name: "Minisuper Sol" } },
  ] });
  assert.deepEqual(parseImport(data, { only: ["convenience"] }).rows.map((r) => r.ref), ["node/1"]);
  const rows = [{ vertical: "convenience", name: "Pulpería A", lat: 9.93, lng: -84.08 }, { vertical: "convenience", name: "Pulpería B", lat: 9.96, lng: -84.08 }];
  assert.equal(dropNearFuel(rows, [{ lat: 9.9303, lng: -84.0802 }], 65), 1);
  assert.deepEqual(rows.map((r) => r.name), ["Pulpería B"]);
});

test("person names in health/vets: a bare person is skipped, a title + establishment goes to review", () => {
  assert.equal(personNameCheck("Dr. Juan Pérez"), "person");
  assert.equal(personNameCheck("Dra. María Mora"), "person");
  assert.equal(personNameCheck("Dr. León Consultorio Médico"), "review");
  assert.equal(personNameCheck("Clínica Santa Rita"), null);
  const review = [];
  const data = JSON.stringify({ elements: [
    { type: "node", id: 10, lat: 9.9, lon: -84.1, tags: { amenity: "doctors", name: "Dr. Juan Pérez" } },
    { type: "node", id: 11, lat: 9.9, lon: -84.1, tags: { amenity: "doctors", name: "Dra. Mora Clínica Dental" } },
    { type: "node", id: 12, lat: 9.9, lon: -84.1, tags: { amenity: "restaurant", name: "Dr. Pizza" } },
  ] });
  const out = parseImport(data, { review });
  assert.deepEqual(out.rows.map((r) => r.ref), ["node/11", "node/12"]);
  assert.deepEqual(review.map((r) => r.decision), ["skipped_person", "imported_review"]);
});

test("generic names, ATM names from the operator, rows carry the kind attribute", () => {
  for (const n of ["Hotel", "Ferretería", "Clínica", "Taller", "Barbería", "Gimnasio", "Panadería", "Museo", "Banco", "Cajero automático"]) assert.ok(isGenericName(n), n);
  const data = JSON.stringify({ elements: [
    { type: "node", id: 20, lat: 9.9, lon: -84.1, tags: { amenity: "atm", operator: "BCR" } },
    { type: "node", id: 21, lat: 9.9, lon: -84.1, tags: { amenity: "atm", name: "ATM" } },
    { type: "node", id: 22, lat: 9.9, lon: -84.1, tags: { tourism: "hostel", name: "Hostal Pura Vida", internet_access: "wlan" } },
  ] });
  const { rows } = parseImport(data);
  assert.deepEqual(rows.map((r) => [r.name, r.vertical, r.attributes]), [
    ["Cajero automático BCR", "banking", { kind: "atm", operator: "BCR" }],
    ["Hostal Pura Vida", "lodging", { kind: "hostel", wifi: true }],
  ]);
});

test("nearby duplicates: same vertical + name within 50 m keep one row; a bank absorbs its ATM", () => {
  const rows = [
    { ref: "a", vertical: "banking", name: "Banco Nacional", lat: 9.93, lng: -84.08, attributes: { kind: "atm" } },
    { ref: "b", vertical: "banking", name: "Banco Nacional", lat: 9.9301, lng: -84.0801, attributes: { kind: "bank" } },
    { ref: "c", vertical: "cafe_bar", name: "Banco Nacional", lat: 9.93, lng: -84.08, attributes: { kind: "cafe" } },
    { ref: "d", vertical: "banking", name: "Banco Nacional", lat: 9.94, lng: -84.08, attributes: { kind: "bank" } },
  ];
  assert.equal(dedupeNearby(rows, 50), 1);
  assert.deepEqual(rows.map((r) => r.ref), ["b", "c", "d"]);
  assert.equal(rows[0].attributes.atm, true);
});

test("parqueos: named public lots with kinds; private lots and generic names are skipped", () => {
  assert.deepEqual(classifyTags({ amenity: "parking" }), { vertical: "parking", attributes: { kind: "public" } });
  assert.equal(classifyTags({ amenity: "parking", parking: "multi-storey" }).attributes.kind, "covered");
  assert.equal(classifyTags({ amenity: "parking", parking: "underground" }).attributes.kind, "covered");
  assert.equal(classifyTags({ amenity: "motorcycle_parking" }).attributes.kind, "motorcycle");
  assert.equal(classifyTags({ amenity: "parking", hgv: "designated" }).attributes.kind, "truck");
  assert.equal(classifyTags({ amenity: "parking", access: "private" }), null);
  assert.equal(classifyTags({ amenity: "parking", access: "customers" }), null);
  for (const n of ["Parqueo", "Parqueo 2", "Parqueo de clientes", "Parqueo Privado", "Estacionamiento", "Parking", "Parqueo para visitas", "Parqueo B"]) assert.ok(isGenericParkingName(n), n);
  for (const n of ["Parqueo Central", "Parqueo Multiplaza", "Parqueo La Sabana"]) assert.ok(!isGenericParkingName(n), n);
  const data = JSON.stringify({ elements: [
    { type: "node", id: 30, lat: 9.93, lon: -84.08, tags: { amenity: "parking", name: "Parqueo" } },
    { type: "node", id: 31, lat: 9.93, lon: -84.08, tags: { amenity: "parking", name: "Parqueo de empleados" } },
    { type: "way", id: 32, center: { lat: 9.93, lon: -84.08 }, tags: { amenity: "parking", parking: "multi-storey", name: "Parqueo Central" } },
    { type: "node", id: 33, lat: 9.93, lon: -84.08, tags: { amenity: "car_wash", name: "Lavacar El Pulpo" } },
  ] });
  assert.deepEqual(parseImport(data).rows.map((r) => [r.ref, r.vertical, r.attributes.kind]), [["way/32", "parking", "covered"], ["node/33", "car_wash", "car_wash"]]);
});

test("lavacar: OSM car washes go to the car_wash section with a kind", () => {
  assert.deepEqual(classifyTags({ amenity: "car_wash" }), { vertical: "car_wash", attributes: { kind: "car_wash" } });
  assert.equal(classifyTags({ amenity: "car_wash", self_service: "yes" }).attributes.kind, "self_service");
  assert.equal(classifyTags({ amenity: "car_wash", name: "Detailing Pro CR" }).attributes.kind, "detailing");
  assert.equal(classifyTags({ amenity: "car_wash", name: "Lavado de Motos Juan" }).attributes.kind, "motorcycle_wash");
  assert.equal(verticalFromTags({ shop: "car_repair", amenity: "car_wash" }), "auto_services");
  assert.ok(isGenericName("Lavacar") && isGenericName("Car Wash"));
});

test("--inside-only: rows outside every level-4 boundary are dropped", () => {
  const square = (lat0, lon0) => [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]].map(([a, b]) => ({ lat: lat0 + a, lon: lon0 + b }));
  const areas = loadAdminAreas(JSON.stringify({ elements: [
    { type: "relation", id: 1, tags: { admin_level: "4", name: "Provincia de San José" }, members: [{ type: "way", role: "outer", geometry: square(9.5, -84.5) }] },
  ] }));
  const rows = [{ ref: "in", lat: 9.9, lng: -84.1 }, { ref: "out", lat: 11.3, lng: -85.9 }, { ref: "nopoint" }];
  assert.equal(dropOutsideAreas(rows, areas), 2);
  assert.deepEqual(rows.map((r) => r.ref), ["in"]);
});
