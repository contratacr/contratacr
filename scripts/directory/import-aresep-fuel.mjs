#!/usr/bin/env node
// LOCAL PRO ONLY (multivertical P1). Offline: reads ONE local JSON file with a national ARESEP fuel price set and prints
// the payloads for price_item_upsert (fuel items) and price_official_set_record (one atomic set with the resolution
// number and validity). Fuel prices in Costa Rica are national and regulated: they are recorded once with place = null.
// Usage: node scripts/directory/import-aresep-fuel.mjs <local-json> [--out <dir>]
// File shape: {source:'aresep', resolution:'RE-####-IE-AAAA', publishedAt, validFrom, validTo?, currency?:'CRC',
//              prices:[{product:'regular'|'super'|'diesel'|'lpg', pricePerLiter}]}  (see fixtures/aresep-fuel-sample.json)
// The actionId is derived from the file content hash, so re-importing the same file is idempotent in the database.
// No network access, no database connection: apply the payloads with the RPCs (service role).
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

/** Product → price item (slug, official code, name). */
export const FUEL_ITEMS={
 regular:{slug:'fuel-regular',kind:'fuel',officialCode:'aresep:gasolina-regular',name:'Gasolina regular (RON 91)',unitBase:'l',unitQty:1},
 super:{slug:'fuel-super',kind:'fuel',officialCode:'aresep:gasolina-super',name:'Gasolina súper (RON 95)',unitBase:'l',unitQty:1},
 diesel:{slug:'fuel-diesel',kind:'fuel',officialCode:'aresep:diesel',name:'Diésel',unitBase:'l',unitQty:1},
 lpg:{slug:'lpg-bulk',kind:'lpg',officialCode:'aresep:glp-granel',name:'Gas licuado (GLP) a granel',unitBase:'l',unitQty:1},
};
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const uuidFromHash=(hex)=>`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;

/** Validates the file (same rules as aresepFuelFileSchema) and returns {items, set}. Throws with a Spanish message. */
export function buildAresepPayloads(data,rawText){
 const fail=m=>{throw new Error('Archivo ARESEP inválido: '+m);};
 if(!data||typeof data!=='object'||Array.isArray(data))fail('se esperaba un objeto');
 const allowed=new Set(['_note','source','resolution','publishedAt','validFrom','validTo','currency','prices']);
 for(const k of Object.keys(data))if(!allowed.has(k))fail('campo desconocido '+k);
 if(data.source!=='aresep')fail('source debe ser "aresep"');
 if(typeof data.resolution!=='string'||!/^RE-\d{1,5}-[A-Z]{1,4}-\d{4}$/.test(data.resolution))fail('número de resolución (RE-####-IE-AAAA)');
 for(const k of ['publishedAt','validFrom'])if(typeof data[k]!=='string'||!ISO.test(data[k])||Number.isNaN(Date.parse(data[k])))fail(k);
 if(data.validTo!==undefined&&(typeof data.validTo!=='string'||!ISO.test(data.validTo)||Date.parse(data.validTo)<=Date.parse(data.validFrom)))fail('validTo');
 if(data.currency!==undefined&&data.currency!=='CRC')fail('currency debe ser CRC');
 if(!Array.isArray(data.prices)||data.prices.length<1||data.prices.length>10)fail('prices (1 a 10)');
 const seen=new Set();
 const prices=data.prices.map((p,i)=>{
  if(!p||typeof p!=='object'||Object.keys(p).some(k=>!['product','pricePerLiter'].includes(k)))fail(`prices[${i}]`);
  const item=FUEL_ITEMS[p.product];if(!item)fail(`producto desconocido en prices[${i}]`);
  if(seen.has(p.product))fail('producto repetido '+p.product);seen.add(p.product);
  const n=p.pricePerLiter;if(typeof n!=='number'||!Number.isFinite(n)||n<=0||n>=1e8||Math.round(n*100)!==n*100)fail(`precio en prices[${i}]`);
  return {itemSlug:item.slug,price:n};
 });
 const hash=createHash('sha256').update(rawText??JSON.stringify(data)).digest('hex');
 const items=[...seen].map(product=>{const it=FUEL_ITEMS[product];
  return {actionId:uuidFromHash(createHash('sha256').update('aresep-item:'+hash+':'+it.slug).digest('hex')),slug:it.slug,kind:it.kind,officialCode:it.officialCode,name:it.name,unitBase:it.unitBase,unitQty:it.unitQty,rxRequired:false};});
 const set={actionId:uuidFromHash(hash),sourceKind:'official_aresep',sourceId:'aresep',sourceRef:data.resolution,observedAt:data.publishedAt,validFrom:data.validFrom,
  ...(data.validTo?{validTo:data.validTo}:{}),prices};
 return {items,set,fileSha256:hash};
}

async function main(argv){
 const args=argv.slice(2);const file=args[0];const outIdx=args.indexOf('--out');const out=outIdx>=0?args[outIdx+1]:null;
 if(!file||file.startsWith('--')){console.error('Uso: node scripts/directory/import-aresep-fuel.mjs <archivo-local.json> [--out <dir>]');process.exit(2);}
 if(/^[a-z][a-z0-9+.-]*:\/\//i.test(file)){console.error('Solo archivos locales: no se descargan URLs.');process.exit(2);}
 const raw=await readFile(file,'utf8');
 const payloads=buildAresepPayloads(JSON.parse(raw),raw);
 if(out){await mkdir(out,{recursive:true});await writeFile(join(out,'aresep-items.json'),JSON.stringify(payloads.items,null,1));await writeFile(join(out,'aresep-set.json'),JSON.stringify(payloads.set,null,1));
  console.log(`OK ${payloads.set.sourceRef}: ${payloads.items.length} productos → ${out}`);}
 else console.log(JSON.stringify(payloads,null,1));
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)main(process.argv).catch(e=>{console.error(e.message);process.exit(1);});
