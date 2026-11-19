// Run: node --test scripts/pro/gaps-editions.test.mjs
// LOCAL PRO ONLY (gaps round 2026-11-17). Pure unit tests, no DB/network:
//  - src/lib/pro/edition-choice.ts: the edition picker's request schema, role → canChoose, and the picker address.
//  - src/lib/pro/hub-sections.ts: «Equipo» and «Edición de Pro» are Pro space sections (no document load to another page).
import test from 'node:test';
import assert from 'node:assert/strict';
const E=await import('../../src/lib/pro/edition-choice.ts');
const H=await import('../../src/lib/pro/hub-sections.ts');
const owner='11111111-1111-4111-8111-111111111111',action='22222222-2222-4222-8222-222222222222';
const read=(extra={})=>({ownerId:owner,edition:'servicios',active:true,implicit:true,revision:0,paywallEnabled:false,entitled:true,tier:'basico',source:'launch_free',modules:[{module:'projects',inEdition:true,active:true,minTier:'basico',override:null}],...extra});

test('choose request: only the four launch editions, exact keys, non-negative integer revision',()=>{
 assert.ok(E.editionChoiceSchema.safeParse({actionId:action,edition:'restaurantes',revision:0}).success);
 for(const edition of ['servicios','autos','restaurantes','comercio'])assert.ok(E.editionChoiceSchema.safeParse({actionId:action,edition,revision:3}).success,edition);
 assert.equal(E.editionChoiceSchema.safeParse({actionId:action,edition:'bienes_raices',revision:0}).success,false,'property classifieds are flagged off');
 assert.equal(E.editionChoiceSchema.safeParse({actionId:action,edition:'autos',revision:0,tier:'plus'}).success,false,'no tier/billing fields');
 assert.equal(E.editionChoiceSchema.safeParse({actionId:action,edition:'autos',revision:-1}).success,false);
 assert.equal(E.editionChoiceSchema.safeParse({actionId:action,edition:'autos',revision:1.5}).success,false);
 assert.equal(E.editionChoiceSchema.safeParse({actionId:'x',edition:'autos',revision:0}).success,false);
});
test('only the owner or a company admin can choose; suspended or not entitled never',()=>{
 assert.equal(E.editionSettingsView(read(),'owner').canChoose,true);
 assert.equal(E.editionSettingsView(read(),'admin').canChoose,true);
 for(const role of ['manager','member','read_only',null])assert.equal(E.editionSettingsView(read(),role).canChoose,false,String(role));
 assert.equal(E.editionSettingsView(read({active:false}),'owner').canChoose,false);
 assert.equal(E.editionSettingsView(read({entitled:false}),'owner').canChoose,false);
 const view=E.editionSettingsView(read({edition:'unknown'}),'owner');assert.equal(view.edition,'servicios');
 assert.deepEqual(Object.keys(view.modules[0]),['module','inEdition','active'],'no tier/billing internals in the view');
 assert.ok(E.editionViewSchema.safeParse(view).success);
 for(const edition of await_modules.PRO_EDITIONS)assert.ok(E.editionViewSchema.safeParse({...view,edition}).success,'view accepts '+edition);
});
test('picker address keeps the locale and preselects the edition',()=>{
 assert.equal(E.editionSettingsPath('es','restaurantes'),'/dashboard/pro?tab=pro_editions&edicion=restaurantes');
 assert.equal(E.editionSettingsPath('en'),'/en/dashboard/pro?tab=pro_editions');
});
test('every edition has ES/EN copy and every module a label',()=>{
 for(const edition of E.PRO_CHOOSABLE_EDITIONS)for(const lang of ['es','en'])assert.ok(E.EDITION_COPY[edition][lang].name&&E.EDITION_COPY[edition][lang].text,edition+lang);
 const {PRO_MODULES}=await_modules;for(const m of PRO_MODULES)assert.ok(E.MODULE_COPY[m]?.es&&E.MODULE_COPY[m]?.en,m);
 assert.doesNotMatch(JSON.stringify(E.EDITION_COPY),/\btu\b|\btus\b|\bpuedes\b/u,'Spanish uses usted');
});
const await_modules=await import('../../src/lib/pro/editions.ts');
test('Equipo and Edición de Pro are sections of the Pro space',()=>{
 for(const en of [false,true]){
  const items=H.proHubGroups(en,true,null).flatMap(g=>g.items);
  const team=items.find(i=>i.key==='team'),editions=items.find(i=>i.key==='editions');
  assert.equal(team?.tab,'pro_team');assert.equal(team?.team,undefined);assert.equal(team?.href,undefined);
  assert.equal(editions?.tab,'pro_editions');assert.equal(editions?.label,en?'Pro edition':'Edición de Pro');
 }
 assert.equal(H.proHubGroups(false,false,null).flatMap(g=>g.items).some(i=>i.key==='team'||i.key==='editions'),false,'embedded panel unchanged');
});
