import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const root=new URL('../../src/lib/',import.meta.url).href;
registerHooks({
 resolve(specifier,context,next){return next(context.parentURL?.startsWith(root)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);},
 load(url,context,next){
  if(url.endsWith('/private-estimate-export.ts'))return{format:'module',source:'export function renderPrivateEstimatePdfDocument(){throw Error("PDF rendering is deliberately disabled in this pure identity verifier");}',shortCircuit:true};
  return url.startsWith(root)&&url.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:next(url,context);
 }
});
const d=await import('../../src/lib/pro/private-estimate-publication-export.ts');
const actor=crypto.randomUUID(),value={publicationId:crypto.randomUUID(),estimateId:crypto.randomUUID(),version:1,estimateRevision:2,content:{title:'Cotización compartida Álvarez',currency:'CRC',validUntil:null,notes:'Alcance publicado',issuer:{issuerName:'Servicios López',issuerIdType:'',issuerId:'',issuerEmail:'',issuerPhone:'',issuerAddress:''},customer:{name:'Cliente Muñoz',tradeName:null,identification:null,address:null},lines:[{id:crypto.randomUUID(),description:'Revisión eléctrica',unit:'hora',qtyMilli:1000,unitPriceCents:100,discountBps:0,taxBps:0}],subtotalCents:100,discountCents:0,taxCents:0,totalCents:100},contentHash:'a'.repeat(64),revision:1,status:'shared',recipientBound:true,createdAt:'2026-11-10T18:00:00Z'};
let passed=0;function test(name,run){run();passed++;console.log('PASS '+name);}
test('client and owner projections refer to the same immutable published PDF',()=>assert.equal(d.privateEstimatePublicationPdfIdentity(value),d.privateEstimatePublicationPdfIdentity({...value,estimateId:null})));
test('later decisions do not replace the historical published content',()=>{for(const status of ['accepted','declined','superseded','withdrawn'])assert.equal(d.privateEstimatePublicationPdfIdentity(value),d.privateEstimatePublicationPdfIdentity({...value,status,revision:8}));});
test('version, publication, hash, captured source revision and timestamp are identity facts',()=>{for(const patch of [{publicationId:crypto.randomUUID()},{version:2},{estimateRevision:3},{contentHash:'b'.repeat(64)},{createdAt:'2026-11-11T18:00:00Z'}])assert.notEqual(d.privateEstimatePublicationPdfIdentity(value),d.privateEstimatePublicationPdfIdentity({...value,...patch}));});
test('saved text changes cannot be silently accepted because money still matches',()=>assert.notEqual(d.privateEstimatePublicationPdfIdentity(value),d.privateEstimatePublicationPdfIdentity({...value,content:{...value.content,title:'Documento actual distinto'}})));
test('private references and mismatched totals are rejected before rendering',()=>{for(const patch of [{ownerId:actor},{clientId:'private-customer'},{source:{kind:'manual',id:crypto.randomUUID()}}])assert.throws(()=>d.privateEstimatePublicationPdfIdentity({...value,...patch}));assert.throws(()=>d.privateEstimatePublicationPdfIdentity({...value,content:{...value.content,totalCents:101}}));});
console.log(`${passed} publication PDF identity contracts passed; rendering disabled, no database, browser or network.`);
