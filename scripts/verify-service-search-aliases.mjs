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
    exports, console, setTimeout, clearTimeout,
    require: (name) => {
      assert.ok(name.startsWith("@/"), `Unexpected dependency: ${name}`);
      return loadModule(name.slice(2));
    },
  });
  return exports;
}
const api = loadModule("lib/data/categories");
const { servicioSugerido } = loadModule("lib/data/sugerir-servicio");
const approved = [
  ["rotulacion", "Rotulación"],
  ["consultoria_alimentaria", "Consultoría para negocios de alimentos"],
  ["capacitacion_en_manipulacion_de_alimento", "Capacitación en manipulación de alimentos"],
  ["reparacion_de_televisores", "Reparación de televisores"],
  ["preparacion_para_examenes_de_admision", "Preparación para exámenes de admisión"],
  ["electricidad_industrial", "Electricidad industrial"],
  ["gestoria_tramites", "Gestoría de trámites"],
  ["cesped_sintetico", "Césped sintético"],
  ["instalaciones_y_armado_de_muebles", "Instalaciones y armado de muebles"],
  ["neuropsicologa", "Neuropsicóloga"],
].map(([id, label]) => ({ id, label, groupId: "profesional" }));

test("aliases never create or publish a pending service", () => {
  api.setCustomCategories(approved);
  assert.equal(api.getAllCategories().some(c => c.id === "imprenta"), false);
  assert.equal(api.searchCategories("litografía").some(c => c.id === "imprenta"), false);
});

test("reviewed wording reaches the real service in both search and intent resolution", () => {
  api.setCustomCategories(approved);
  const cases = [
    ["contabilidad para pymes", "contabilidad"],
    ["contadora", "contabilidad"],
    ["fontanería", "plomeria"],
    ["técnico línea blanca", "reparacion_electrodomesticos"],
    ["construcción llave en mano", "construccion"],
    ["apertura de vehículo por llaves adentro", "cerrajeria"],
    ["manicura", "unhas"],
    ["pedicura", "unhas"],
    ["sistemas de bombeo", "bombas_agua"],
    ["respuesta armada inmediata", "monitoreo_alarmas"],
    ["servicios electromecánicos", "electromecanica"],
    ["electricista industrial", "electricidad_industrial"],
    ["control de accseso", "control_acceso"],
    ["registro pyme meic", "gestoria_tramites"],
    ["exoneraciones tributarias", "asesoria_tributaria"],
    ["consultoría iso", "consultoria"],
    ["consultoría alimentaria", "consultoria_alimentaria"],
    ["asesoría para restaurantes", "consultoria_alimentaria"],
    ["food business consulting", "consultoria_alimentaria"],
    ["carné de manipulación de alimentos", "capacitacion_en_manipulacion_de_alimento"],
    ["clases paa ucr itcr", "preparacion_para_examenes_de_admision"],
    ["reparación de tv", "reparacion_de_televisores"],
    ["signage", "rotulacion"],
    ["zacate sintético", "cesped_sintetico"],
    ["furniture assembly", "instalaciones_y_armado_de_muebles"],
    ["neuropsicología", "neuropsicologa"],
  ];
  for (const [query, id] of cases) {
    assert.equal(api.resolveStrongCategoryIntent(query)?.id, id, `intent: ${query}`);
    assert.ok(api.searchCategories(query).slice(0, 6).some(c => c.id === id), `search: ${query}`);
  }
});

test("the short Imprenta name gains printing vocabulary only when approved", () => {
  api.setCustomCategories([...approved, { id: "imprenta", label: "Imprenta", groupId: "profesional" }]);
  for (const query of ["litografía", "impresión comercial", "impresión de volantes", "print shop", "commercial printing"]) {
    assert.equal(api.resolveStrongCategoryIntent(query)?.id, "imprenta", query);
    assert.equal(api.searchCategories(query)[0]?.id, "imprenta", query);
  }
  assert.equal(api.getAllCategories().find(c => c.id === "imprenta").label, "Imprenta");
  api.setCustomCategories(approved);
});

test("generic rejected requests do not become forced service suggestions", () => {
  for (const query of ["Pymes", "Certificaciones", "Freelance", "Servicios profesionales", "Técnico en mantenimiento", "Audio"]) {
    assert.equal(servicioSugerido(query), null, query);
  }
  assert.equal(servicioSugerido("Electricista industrial"), "electricidad_industrial");
});

test("overlay refresh preserves base vocabulary and reviewed aliases", () => {
  api.setCustomCategories([...approved, { id: "contabilidad", label: "Contabilidad y finanzas", groupId: "profesional" }]);
  const category = api.getAllCategories().find(c => c.id === "contabilidad");
  assert.ok(category.keywords.includes("CPA"));
  assert.ok(category.keywords.includes("contadora"));
  assert.equal(new Set(category.keywords).size, category.keywords.length);
});

test("a cold autocomplete API loads approved aliases before answering", async () => {
  api.setCustomCategories([]);
  const exports = {};
  const source = readFileSync(new URL("../src/app/api/search/suggestions/route.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, console, URL, process: { env: {} },
    require: (name) => {
      if (name === "next/server") return { NextResponse: { json: value => value } };
      if (name === "next/cache") return { unstable_cache: fn => fn };
      if (name === "@/lib/data/server-category-catalog") return { ensureServerCategoryCatalog: async () => api.setCustomCategories(approved) };
      if (name === "@/lib/data/categories") return api;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const answer = await exports.GET({ url: "https://example.test/api/search/suggestions?q=asesoria%20para%20restaurantes" });
  assert.equal(answer.suggestions[0]?.id, "consultoria_alimentaria");
  const pending = await exports.GET({ url: "https://example.test/api/search/suggestions?q=litografia" });
  assert.equal(pending.suggestions.some(c => c.id === "imprenta"), false);
});
