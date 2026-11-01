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
const api = loadModule("lib/data/categories");
const { servicioSugerido } = loadModule("lib/data/sugerir-servicio");

const cases = {
  "electricidad": [
    "no tengo luz en mi casa",
    "no tengo luz en casa",
    "no hay luz en mi casa",
    "se va la luz en una parte de la casa",
    "se bajan los breakers",
    "el enchufe no funciona",
    "el tomacorriente no funciona",
    "the power is out in my house",
    "my wall socket is not working"
  ],
  "plomeria": [
    "el inodoro esta tapado",
    "el servicio sanitario esta tapado",
    "el lavamanos no desagua",
    "el fregadero esta tapado",
    "se sale el agua del tubo",
    "el tubo tiene una fuga",
    "my sink is clogged",
    "my toilet is clogged"
  ],
  "calentadores": [
    "la ducha no calienta",
    "no sale agua caliente de la ducha",
    "el calentador de agua no prende",
    "my shower has no hot water"
  ],
  "techos": [
    "tengo goteras en el techo",
    "cae agua del techo cuando llueve",
    "se mete la lluvia por el techo",
    "my roof is leaking"
  ],
  "cerrajeria": [
    "me quede fuera de mi casa sin llaves",
    "perdi las llaves de mi casa",
    "la llave se quebro en la cerradura",
    "i am locked out of my house"
  ],
  "aire_acondicionado": [
    "el aire acondicionado no enfria",
    "el aire acondicionado gotea",
    "my air conditioner is not cooling"
  ],
  "reparacion_electrodomesticos": [
    "la lavadora no centrifuga",
    "la lavadora no enciende",
    "la refrigeradora no enfria",
    "la refri no enfria",
    "el microondas no calienta",
    "my washing machine is not spinning",
    "my refrigerator is not cooling"
  ],
  "redes_internet": [
    "el wifi no llega a mi cuarto",
    "mi wifi se desconecta a cada rato",
    "el internet esta lento en mi casa",
    "my wifi keeps disconnecting"
  ],
  "reparacion_computadoras": [
    "mi laptop esta muy lenta",
    "la computadora se queda pegada",
    "mi laptop no prende",
    "my laptop will not turn on"
  ],
  "reparacion_celulares": [
    "se quebro la pantalla de mi celular",
    "mi telefono no carga",
    "my phone will not charge"
  ],
  "fumigacion": [
    "tengo cucarachas en mi casa",
    "hay termitas en los muebles",
    "tengo una plaga de hormigas",
    "there are cockroaches in my house"
  ],
  "costura_y_arreglos_de_ropa": [
    "necesito hacerle el ruedo a un pantalon",
    "el pantalon me queda muy largo",
    "my pants are too long"
  ],
  "jardineria": [
    "el zacate esta muy alto",
    "necesito cortar el pasto del patio",
    "my lawn needs mowing"
  ],
  "mudanzas": [
    "necesito trasladar mis muebles a otra casa",
    "me voy a cambiar de casa",
    "i am moving to another house"
  ]
};
for (const [id, phrases] of Object.entries(cases)) test(`daily needs resolve in search and assistant: ${id}`, () => {
 for (const phrase of phrases) {
  assert.equal(api.resolveStrongCategoryIntent(phrase)?.id, id, phrase);
  assert.equal(api.resolveCategoryIntent(phrase)?.id, id, phrase);
  assert.equal(api.searchCategories(phrase)[0]?.id, id, phrase);
  assert(api.getMatchingCategoryIds(phrase).includes(id), `professional search: ${phrase}`);
 }
});
test('unclear words do not become confident service matches', () => {
 for (const phrase of ['no tengo agua','no funciona','ayuda con algo','luz para una foto','necesito un tecnico','se rompio una cosa']) assert.equal(api.resolveStrongCategoryIntent(phrase), null, phrase);
});
test('aliases cannot revive a hidden service', () => {
 api.setCategoryFeatureOverrides([{ id:'electricidad',isHidden:true }]);
 assert.notEqual(api.resolveStrongCategoryIntent('no tengo luz en mi casa')?.id, 'electricidad');
 assert(!api.searchCategories('no tengo luz en mi casa').some(c=>c.id==='electricidad'));
 api.setCategoryFeatureOverrides([]);
});

test('previous natural scenarios keep their category', () => {
 for (const item of api.getAllCategories()) for (const phrase of api.NATURAL_SERVICE_SCENARIOS[item.id] ?? []) assert.equal(api.resolveCategoryIntent(phrase)?.id,item.id,phrase);
});
test('unknown answers preserve the users exact search instead of a generic CTA', () => {
 const source=readFileSync(new URL('../src/app/api/ai-assistant/route.ts',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('function uncertainSearchPayload('),source.indexOf('function sanitizeHistory('));
 const context={};vm.createContext(context);
 vm.runInContext(ts.transpile(fn,{target:ts.ScriptTarget.ES2022}),context);
 for(const locale of ['es','en']) {
  const message='necesito arreglar un cosito raro';const payload=context.uncertainSearchPayload(message,locale);
  assert.equal(payload.searchQuery,message);assert.equal(payload.serviceId,null);
  assert(payload.ctaLabel.includes(message));assert(payload.answer.includes(message));assert.equal(payload.action,'search_professionals');
 }
});
test('service searches use the canonical destination without a middleware redirect', () => {
 const {rutaDeBusqueda}=loadModule('lib/buscar-url');
 const href=rutaDeBusqueda({categoria:'electricidad',provincia:'al',canton:'al-at',q:'no tengo luz en mi casa'});
 assert(href.startsWith('/profesionales/electricidad/'));assert(!href.includes('categoria='));
 assert.equal(new URL(href,'https://contratacr.com').searchParams.get('q'),'no tengo luz en mi casa');
});

test('real assistant normalization recognizes everyday needs before a low-confidence model guess', () => {
 const source=readFileSync(new URL('../src/app/api/ai-assistant/route.ts',import.meta.url),'utf8');
 const exports={};
 const pure=new Set(['@/lib/privacy/assistant-topics','@/lib/prefijo-de-idioma','@/lib/buscar-url','@/lib/feature-flags','@/lib/data/categories','@/lib/data/location-search','@/lib/ai/product-knowledge','@/lib/text-limits','@/lib/pricing']);
 vm.runInNewContext(ts.transpileModule(source+'\nexport const testApi={normalizePayload,localAnswer,actionHref,resolveLocationIntent};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,URLSearchParams,console,process:{env:{}},require:name=>{
  if(name==='next/cache')return{unstable_cache:fn=>fn};
  if(pure.has(name))return loadModule(name.slice(2));
  return {};
 }});
 const labels=new Map(api.getAllCategories().map(c=>[c.id,c.label]));
 for(const message of ['No se que profesional buscar para una cosa de la casa','no tengo luz en mi casa','se rompió una cosa','necesito reparar las losas','quiero podar mis rosas','something in my house','es','san','la']) {
  assert.equal(exports.testApi.resolveLocationIntent(message),null,message);
  const href=exports.testApi.actionHref({action:'search_professionals',searchQuery:message},message,'es');
  assert.equal(new URL(href,'https://contratacr.com').pathname,'/profesionales',message);
  assert.equal(new URL(href,'https://contratacr.com').searchParams.get('q'),message);
 }
 for(const message of ['No se que profesional buscar para una cosa de la casa','No se si ocupo abogado o notario','No se si esto es electrico o de plomeria','I am not sure what service I need',"I don't know who can fix this problem",'I am not sure whether I need an electrician or a plumber']) {
  const local=exports.testApi.localAnswer(message,'es');
  const result=exports.testApi.normalizePayload(local,message,'es',[],labels);
  const href=new URL(exports.testApi.actionHref(result,message,'es'),'https://contratacr.com');
  assert.equal(result.action,'search_professionals',message);
  assert.equal(result.serviceId,null,message);
  assert.equal(href.pathname,'/profesionales',message);
  assert.equal(href.searchParams.get('q')?.toLowerCase(),message.toLowerCase(),message);
  assert.match(result.answer,/buscar|search/i,message);
 }
 const freshHistory=[{role:'user',content:'Necesito un electricista en Siquirres'},{role:'assistant',content:'Encontré profesionales de electricidad en Siquirres, Limón.'}];
 const fresh=exports.testApi.normalizePayload(exports.testApi.localAnswer('limpieza','es'),'limpieza','es',freshHistory,labels);
 assert.equal(fresh.serviceId,'limpieza');assert.equal(fresh.action,'answer');
 assert.match(fresh.answer,/provincia o cant[oó]n/i);assert.doesNotMatch(fresh.answer,/Siquirres|Lim[oó]n/i);
 assert.equal(exports.testApi.actionHref(fresh,'limpieza','es'),null);
 const clearNeed='No sé cómo se llama, pero no tengo luz en mi casa';
 assert.equal(exports.testApi.normalizePayload(exports.testApi.localAnswer(clearNeed,'es'),clearNeed,'es',[],labels).serviceId,'electricidad');
 for(const [message,label] of [['Osa','Osa'],['Necesito ayuda en Osa, Puntarenas','Osa'],['Necesito un plomero en Atenas','Atenas'],['Busco ayuda en Alajuela','Alajuela'],['Necesito un electricista en Escazú.','Escazú'],['San José','San José'],['Pavas','Pavas']]) {
  assert.equal(exports.testApi.resolveLocationIntent(message)?.label,label,message);
 }

 for(const [id,phrases]of Object.entries(cases))for(const message of phrases){
  const result=exports.testApi.normalizePayload({action:'search_professionals',confidence:0},message,'es',[],labels);
  assert.equal(result.serviceId,id,message);assert.equal(result.action,'answer',message);
  assert(result.answer.includes(labels.get(id)),message);
 }
 const unclear=exports.testApi.normalizePayload({action:'search_professionals',confidence:0},'No tengo luz en mi casa','es',[],labels);
 assert.equal(unclear.serviceId,'electricidad');assert(!unclear.answer.includes('No estoy seguro'));
 for(const locale of ['es','en']) {
  const followup=exports.testApi.normalizePayload({action:'search_professionals',confidence:0},'Atenas',locale,[{role:'user',content:'No tengo luz en mi casa'},{role:'assistant',content:unclear.answer,serviceId:'electricidad'}],labels);
  assert.equal(followup.serviceId,'electricidad');assert.equal(followup.action,'search_professionals');
  const href=exports.testApi.actionHref(followup,'Atenas',locale);
  assert(href.startsWith('/profesionales/electricidad/alajuela/atenas'),href);
 }
 const unknown=exports.testApi.actionHref({action:'search_professionals',searchQuery:'un cosito raro'},'un cosito raro','es');
 assert.equal(new URL(unknown,'https://contratacr.com').searchParams.get('q'),'un cosito raro');

});
