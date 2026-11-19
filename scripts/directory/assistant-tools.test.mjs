// Run: node --test scripts/directory/
// LOCAL PRO ONLY (multivertical A1/A2): assistant directory tools with a MOCK backend (no model, no network, no DB).
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const root = new URL("../../src/lib/", import.meta.url).href;
registerHooks({ resolve(s, c, next) { return next(c.parentURL?.startsWith(root) && s.startsWith(".") && !/\.[a-z]+$/i.test(s) ? s + ".ts" : s, c); } });
const T = await import("../../src/lib/directory/assistant-tools.ts");

const now = new Date("2026-11-17T15:00:00Z");
const obs = (price, extra = {}) => ({ price, currency: "CRC", unitPrice: price, unitBase: "kg", sourceKind: "official_meic", confidence: "official", regulated: false,
  source: { name: "MEIC", attribution: "Fuente: MEIC, estudio de precios / Source: MEIC price survey", url: null }, sourceRef: "SINTETICO-1",
  observedAt: "2026-11-02T18:00:00Z", validFrom: "2026-11-02T18:00:00Z", validTo: null, staleAfter: "2027-03-02T18:00:00Z", hasEvidence: false, stale: false, staleReason: null, ...extra });
const place = (slug, name, extra = {}) => ({ kind: "place", key: "p:" + slug, slug, name, status: "published", vertical: { id: "pharmacy" },
  address: { adminArea1: "Heredia", adminArea2: "Heredia", adminArea3: null, locality: "Centro" }, location: null, rating: { average: null, count: 0 },
  verificationLevel: "license_verified", openNow: true, open24h: false, attributes: {}, keywords: [], distanceKm: null, signals: {}, ranking_reason: [], ...extra });

function mockBackend() {
  const calls = [];
  return {
    calls,
    async searchPlaces(input) { calls.push(["searchPlaces", input]); return [place("farmacia-b", "Farmacia B"), place("farmacia-a", "Farmacia A", { openNow: null, verificationLevel: "imported" })]; },
    async getPlace(slug) { calls.push(["getPlace", slug]); return slug === "farmacia-a" ? { slug, name: "Farmacia A", address: { line: "Calle 1", locality: "Centro", adminArea2: "Heredia", adminArea1: "Heredia" },
      phone: "+506 2222 2222", sources: [{ name: "OpenStreetMap", license: "ODbL 1.0", attribution: "©", url: null }], updatedAt: "2026-11-10T12:00:00Z" } : null; },
    async searchPriceItems(q, vertical) { calls.push(["searchPriceItems", q, vertical]); return { q, vertical, items: /arroz/.test(q) ? [{ slug: "arroz-1kg", name: "Arroz", presentation: "1 kg", offers: 2 }] : [] }; },
    async comparePrices(item, opts) { calls.push(["comparePrices", item, opts]); return { item: { slug: item, name: "Arroz", presentation: "1 kg", normalizedUnit: "kg" }, asOf: now.toISOString(), total: 3, regions: [],
      offers: [
        { place: { slug: "super-b", name: "Súper B" }, unitPrice: 1190, observation: obs(1190), provenance: null },
        { place: { slug: "super-a", name: "Súper A" }, unitPrice: 1250, observation: obs(1250, { sourceKind: "user_report", confidence: "community_verified", sourceRef: null }), provenance: null },
        { place: { slug: "super-c", name: "Súper C" }, unitPrice: 900, observation: obs(900, { stale: true, staleReason: "stale" }), provenance: null },
      ] }; },
  };
}

test("tool definitions are JSON-schema objects with no commercial parameter", () => {
  assert.deepEqual(T.DIRECTORY_TOOLS.map((t) => t.name), ["directory_search_places", "directory_get_place", "directory_compare_prices"]);
  const text = JSON.stringify(T.DIRECTORY_TOOLS);
  for (const word of ["sponsor", "featured", "boost", "paid", "promoted", "plan"]) assert.equal(text.toLowerCase().includes(word), false, word);
  for (const t of T.DIRECTORY_TOOLS) assert.equal(t.input_schema.type, "object");
});

test("planner: sections, province, open now, prices; professional questions are left alone", () => {
  assert.deepEqual(T.planDirectoryCall("farmacias abiertas ahora en Heredia"), { kind: "tool", tool: "directory_search_places", input: { vertical: "farmacias", province: "Heredia", openNow: true, limit: 3 } });
  assert.deepEqual(T.planDirectoryCall("supermercados en San José").input, { vertical: "supermercados", province: "San José", limit: 3 });
  assert.equal(T.planDirectoryCall("gas station in Limón").input.vertical, "gasolineras");
  const p = T.planDirectoryCall("¿Cuánto cuesta el arroz en Cartago?");
  assert.deepEqual([p.tool, p.input.product, p.input.province, p.explicit], ["directory_compare_prices", "arroz", "Cartago", false]);
  assert.equal(T.planDirectoryCall("precio del acetaminofén en farmacias").input.vertical, "pharmacy");
  assert.equal(T.planDirectoryCall("Busco un plomero en Heredia"), null);
  assert.equal(T.planDirectoryCall("Necesito electricista"), null);
});

test("prescription medicines: refused before any backend call", async () => {
  for (const q of ["precio de la amoxicilina", "¿cuánto cuesta un antibiótico en farmacias?", "price of insulin", "precio de medicamento con receta"]) {
    assert.deepEqual(T.planDirectoryCall(q), { kind: "rx_refused" }, q);
    const b = mockBackend();
    const r = await T.directoryAnswer(q, b, "es", now);
    assert.equal(b.calls.length, 0, q);
    assert.match(r.answer, /no muestra precios de medicamentos que requieren receta/);
    assert.match(r.answer, /36868-S/);
  }
  const b = mockBackend();
  assert.match((await T.runDirectoryTool("directory_compare_prices", { product: "amoxicilina" }, b, "en", now)).answer, /prescription/);
  assert.equal(b.calls.length, 0);
});

test("places: neutral backend order kept, data quality and source/date cited (ES and EN)", async () => {
  const b = mockBackend();
  const es = await T.directoryAnswer("farmacias abiertas ahora en Heredia", b, "es", now);
  assert.deepEqual(b.calls[0], ["searchPlaces", { vertical: "farmacias", province: "Heredia", openNow: true, limit: 3 }]);
  assert.ok(es.answer.indexOf("Farmacia B") < es.answer.indexOf("Farmacia A"), "backend order, not re-ranked");
  assert.match(es.answer, /nadie paga por aparecer primero/);
  assert.match(es.answer, /Fuente: Directorio ContrataCR .* consultado el 17 nov 2026/);
  assert.match(es.answer, /datos públicos sin verificar/);
  // 2026-11-17: every pharmacy is listed, each with its permit status (neutral wording when not verified).
  assert.match(es.answer, /Farmacia B — .* · permiso de funcionamiento verificado/);
  assert.match(es.answer, /Farmacia A — .* · permiso sin verificar por ContrataCR/);
  assert.equal(es.href, "/farmacias?province=Heredia&openNow=1");
  const en = await T.directoryAnswer("pharmacies open now in Heredia", mockBackend(), "en", now);
  assert.match(en.answer, /Source: ContrataCR directory .* checked on Nov 17, 2026/);
  assert.equal(en.href, "/en/farmacias?province=Heredia&openNow=1");
  assert.match(en.answer, /Farmacia A — .* · license not verified by ContrataCR/);
});

test("place details cite sources and update date", async () => {
  const r = await T.runDirectoryTool("directory_get_place", { slug: "farmacia-a" }, mockBackend(), "es", now);
  assert.match(r.answer, /OpenStreetMap \(ODbL 1\.0\) · actualizado el 10 nov 2026/);
  assert.equal(r.href, "/lugar/farmacia-a");
  assert.equal(await T.runDirectoryTool("directory_get_place", { slug: "no-existe" }, mockBackend(), "es", now), null);
  assert.equal(await T.runDirectoryTool("directory_get_place", { slug: "../x" }, mockBackend(), "es", now), null, "invalid input");
});

test("prices: current first in backend order, stale excluded, each line with source and date", async () => {
  const b = mockBackend();
  const r = await T.directoryAnswer("¿Cuánto cuesta el arroz en Cartago?", b, "es", now);
  assert.deepEqual(b.calls.map((c) => c[0]), ["searchPriceItems", "comparePrices"]);
  assert.deepEqual(b.calls[1][2], { province: "Cartago", vertical: null });
  const lines = r.answer.split("\n");
  assert.match(lines[1], /^1\. Súper B: ₡1\.190 \(₡1\.190 por kg\) — Fuente: MEIC, estudio de precios · SINTETICO-1 · dato del 2 nov 2026/);
  assert.match(lines[2], /^2\. Súper A: .*Reportado por usuarios · confirmado por varias personas · dato del/);
  assert.equal(r.answer.includes("Súper C"), false, "stale price not presented as current");
  assert.equal(r.citations.length, 2);
  assert.equal(r.href, "/precios?producto=arroz-1kg&provincia=Cartago");
});

test("unknown product: the regular assistant keeps «how much is ContrataCR Pro?», explicit price questions get an answer", async () => {
  assert.equal(await T.directoryAnswer("¿Cuánto cuesta ContrataCR Pro?", mockBackend(), "es", now), null);
  const r = await T.directoryAnswer("comparar precios de pan dulce", mockBackend(), "es", now);
  assert.match(r.answer, /Todavía no tengo precios de «pan dulce»/);
});

// 2026-11-17 sections: searchable by the assistant, with the salud/bancos limits.
test("new sections: planner routes place words, keeps trades with professionals, never prices for health or banks", async () => {
  assert.deepEqual(T.planDirectoryCall("clínicas en Cartago").input, { vertical: "salud", province: "Cartago", limit: 3 });
  assert.equal(T.planDirectoryCall("cajero automático abierto en Heredia").input.vertical, "bancos");
  assert.equal(T.planDirectoryCall("hoteles en Guanacaste").input.vertical, "hospedaje");
  assert.equal(T.planDirectoryCall("ferreterías en Alajuela").input.vertical, "ferreterias");
  assert.equal(T.planDirectoryCall("panaderías en San José").input.vertical, "cafes");
  assert.equal(T.planDirectoryCall("Necesito un mecánico"), null);
  // A price question about a bank or a clinic lists places (with the limit), never a price comparison.
  assert.equal(T.planDirectoryCall("¿cuánto cobra el banco por transferencia?").tool, "directory_search_places");
  assert.equal(T.planDirectoryCall("precio de consulta en clínica").tool, "directory_search_places");
  const b = mockBackend();
  const salud = await T.runDirectoryTool("directory_search_places", { vertical: "salud", limit: 2 }, { ...b, async searchPlaces() { return [
    { kind: "place", slug: "clinica-a", name: "Clínica A", vertical: { id: "health" }, address: { adminArea1: "Cartago", adminArea2: null, adminArea3: null, locality: null },
      verificationLevel: "imported", openNow: null, open24h: false, attributes: { kind: "clinic" } }]; } }, "es", now);
  assert.match(salud.answer, /habilitación sin verificar por ContrataCR/);
  assert.match(salud.answer, /no doy consejo médico ni precios de consultas/);
  assert.match(salud.answer, /9-1-1/);
  const bank = await T.runDirectoryTool("directory_search_places", { vertical: "bancos" }, b, "en", now);
  assert.match(bank.answer, /do not compare rates, fees or financial products/);
  assert.equal(bank.href, "/en/bancos");
});
