// LOCAL PRO ONLY (salud cleanup 2026-11-17): exclusion/reclass rules of the importer and the cleanup plan for places
// already imported (health-cleanup.mjs). Offline.
import test from "node:test";
import assert from "node:assert/strict";
import { classifyTags, isExcludedHealth, HEALTH_RECLASS } from "./stage-import.mjs";
import { healthCleanupPlan, healthCleanupSql } from "./health-cleanup.mjs";

test("health: alternative therapies and retreats are never imported; real establishments are", () => {
  assert.equal(classifyTags({ healthcare: "alternative", name: "Ayahuasca Costa Rica" }), null);
  assert.equal(classifyTags({ healthcare: "alternative", "healthcare:speciality": "chiropractic", amenity: "doctors", name: "Consultorio X" }), null);
  assert.equal(classifyTags({ healthcare: "nutrition_counselling", name: "Retiro Edén" }), null);
  assert.equal(isExcludedHealth({ name: "Ceremonia de kambo" }), true);
  assert.deepEqual(classifyTags({ amenity: "clinic", name: "Clínica Bíblica" }), { vertical: "health", attributes: { kind: "clinic" } });
  assert.deepEqual(classifyTags({ amenity: "hospital", healthcare: "hospital", name: "Banco Nacional de Sangre" }).vertical, "health", "kept in health");
  assert.deepEqual(HEALTH_RECLASS["way/395163574"], { kind: "blood_bank", publicService: true });
});

test("cleanup plan: hide excluded rows, reclass the blood bank, ignore everything else; SQL uses the staff path", () => {
  const plan = healthCleanupPlan([
    { type: "node", id: 13343138455, tags: { healthcare: "alternative", name: "Ayahuasca Costa Rica" } },
    { type: "way", id: 395163574, tags: { amenity: "hospital", healthcare: "hospital", name: "Banco Nacional de Sangre" } },
    { type: "node", id: 7285706099, tags: { healthcare: "podiatrist", name: "Vanessa Wejcham" } },
    { type: "node", id: 1, tags: { amenity: "clinic", name: "Clínica Bíblica" } },
    { type: "node", id: 2, tags: { amenity: "restaurant", name: "Retiro del Sabor" } },
  ]);
  assert.deepEqual(plan.map((p) => [p.ref, p.decision, p.reason]), [
    ["node/13343138455", "hide", "alternative_therapy"],
    ["node/7285706099", "hide", "person"],
    ["way/395163574", "reclass", "subtype"],
  ]);
  const sql = healthCleanupSql(plan, "41e8d2b5-146c-4861-9c5b-e44ec0f69bd1");
  assert.match(sql, /dir_place_mutate/);
  assert.match(sql, /claim_status<>'unclaimed'/);
  assert.match(sql, /'status','hidden'/);
  assert.doesNotMatch(sql, /\bdelete\b|\bupdate public\./i, "never edits rows directly");
  assert.throws(() => healthCleanupSql(plan, "not-a-uuid"));
});
