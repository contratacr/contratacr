#!/usr/bin/env node
// LOCAL PRO ONLY (multivertical P3). Offline importer for an official MEIC price file (canasta básica / monitoreo de
// precios) into price_catalog_upsert + price_official_import_record payloads. No network, no database connection.
//
// IMPORTANT (research 2026-11-17, scratchpad research-verticales/meic-precios.md): MEIC publishes these prices only in
// the MiMejorCompraCR app; no downloadable machine-readable file (CSV/XLSX/API with terms) was found. This importer is
// therefore built against the DOCUMENTED normalized CSV below and tested with synthetic fixtures only. It never invents
// prices: every recorded price comes from the input file, with its source URL, publication date and sha256.
//
// Usage: node scripts/directory/import-meic-prices.mjs --meta <meta.json> --catalog <catalog.json> --places <places.json> [--out <dir>]
//  meta.json    {source:'meic', sourceUrl:'https://…', publicationDate:'YYYY-MM-DD', surveyRef, file:'<csv path, relative to meta>',
//                licenseNote?, validTo?}
//  CSV (UTF-8, comma or semicolon, header required; extra columns ignored):
//    codigo_producto, gtin, producto, presentacion, comercio, canton, provincia, precio
//    precio accepts «1250», «1250.50», «1 250,50», «1.250», «₡1.250,50».
//  catalog.json {items:[{code?, gtin?, slug, kind:'grocery'|'medicine'|'generic', name, brand?, category, presentation?,
//                unitBase, unitQty, rxRequired?, aliases?}]}  (owner-curated; medicine must be rxRequired:false to be listed)
//  places.json  {places:[{establishment, canton?, placeSlug}]}  (owner-curated mapping of the file's establishments)
// The actionIds are derived from the file sha256: re-importing the same file is idempotent (and the DB refuses a second
// batch with the same sha256).
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';

export const MEIC_COLUMNS=['codigo_producto','gtin','producto','presentacion','comercio','canton','provincia','precio'];
const uuidFromHash=(hex)=>`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
const derived=(sha,label)=>uuidFromHash(createHash('sha256').update(`meic:${sha}:${label}`).digest('hex'));
export const normalize=(v)=>String(v??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();

/** GTIN-8/12/13/14 with a valid GS1 check digit (same rule as price_gtin_ok / gtinIsValid). */
export function gtinIsValid(value){
 if(!/^(\d{8}|\d{12,14})$/.test(value))return false;
 const d=value.padStart(14,'0');let sum=0;
 for(let i=0;i<13;i++)sum+=Number(d[i])*(i%2===0?3:1);
 return (10-sum%10)%10===Number(d[13]);
}

/** Costa Rican price text → number with ≤ 2 decimals, or null. */
export function parsePrice(text){
 const s=String(text??'').replace(/[₡\s ]/g,'').replace(/^CRC/i,'');
 let n=null;
 if(/^\d+$/.test(s))n=Number(s);
 else if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s))n=Number(s.replace(/\./g,'').replace(',','.'));
 else if(/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s))n=Number(s.replace(/,/g,''));
 else if(/^\d+,\d{1,2}$/.test(s))n=Number(s.replace(',','.'));
 else if(/^\d+\.\d{1,2}$/.test(s))n=Number(s);
 if(n==null||!Number.isFinite(n)||n<=0||n>=1e8)return null;
 return Math.round(n*100)/100;
}

/** «500 g», «1,8 L», «946 ml», «24 unidades» → {unitBase, unitQty} or null (used to cross-check the curated catalogue). */
export function parsePresentation(text){
 const m=normalize(text).replace(/(\d) (\d{1,3})(?!\d)/,'$1.$2').match(/^(\d+(?:\.\d+)?)\s*(kg|kilos?|g|gr|gramos?|l|lt|litros?|ml|mililitros?|unidades?|u|tabletas?|capsulas?|sobres?)\b/);
 if(!m)return null;
 const q=Number(m[1]);const u=m[2];
 const unitBase=/^(kg|kilo)/.test(u)?'kg':/^(g|gr|gramo)/.test(u)?'g':/^(ml|mililitro)/.test(u)?'ml':/^(l|lt|litro)/.test(u)?'l':'unit';
 return q>0?{unitBase,unitQty:q}:null;
}

/** Minimal RFC 4180 parser (quotes, escaped quotes, CRLF); delimiter detected from the header (comma or semicolon). */
export function parseCsv(text){
 const src=text.replace(/^﻿/,'');const firstLine=src.split(/\r?\n/,1)[0]??'';
 const delim=(firstLine.match(/;/g)?.length??0)>(firstLine.match(/,/g)?.length??0)?';':',';
 const rows=[];let row=[],field='',q=false;
 for(let i=0;i<src.length;i++){
  const c=src[i];
  if(q){if(c==='"'){if(src[i+1]==='"'){field+='"';i++;}else q=false;}else field+=c;continue;}
  if(c==='"'&&field==='')q=true;
  else if(c===delim){row.push(field);field='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&src[i+1]==='\n')i++;row.push(field);field='';if(row.some(f=>f!==''))rows.push(row);row=[];}
  else field+=c;
 }
 if(q)throw new Error('CSV inválido: comillas sin cerrar');
 row.push(field);if(row.some(f=>f!==''))rows.push(row);
 return rows;
}

const ISO_DAY=/^\d{4}-\d{2}-\d{2}$/;
/** Builds every payload. Throws (Spanish message) on a malformed meta/catalogue/places/header; bad rows become row statuses. */
export function buildMeicPayloads({meta,catalog,places,csvText,fileName,today=new Date()}){
 const fail=m=>{throw new Error('Importación MEIC inválida: '+m);};
 if(!meta||meta.source!=='meic')fail('meta.source debe ser "meic"');
 if(typeof meta.sourceUrl!=='string'||!/^https:\/\/[^\s"<>]{3,}$/.test(meta.sourceUrl))fail('meta.sourceUrl (https)');
 if(typeof meta.publicationDate!=='string'||!ISO_DAY.test(meta.publicationDate)||Number.isNaN(Date.parse(meta.publicationDate)))fail('meta.publicationDate (AAAA-MM-DD)');
 if(Date.parse(meta.publicationDate+'T12:00:00-06:00')>today.getTime())fail('meta.publicationDate en el futuro');
 if(typeof meta.surveyRef!=='string'||!meta.surveyRef.trim()||meta.surveyRef.length>120)fail('meta.surveyRef');
 if(meta.validTo!==undefined&&(typeof meta.validTo!=='string'||Number.isNaN(Date.parse(meta.validTo))||Date.parse(meta.validTo)<=Date.parse(meta.publicationDate+'T12:00:00-06:00')))fail('meta.validTo');
 if(!/^[A-Za-z0-9._ -]{1,160}$/.test(fileName))fail('nombre de archivo');
 const fileSha256=createHash('sha256').update(csvText).digest('hex');
 const fileFormat=/\.json$/i.test(fileName)?'json':'csv';

 // Catalogue (owner-curated): GTIN check digit, OTC-only medicine, unit coherent with the presentation when parseable.
 const items=Array.isArray(catalog?.items)?catalog.items:fail('catalog.items');
 const byCode=new Map(),byGtin=new Map(),catalogPayloads=[];
 for(const [n,it] of items.entries()){
  if(!it||typeof it.slug!=='string'||!/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/.test(it.slug))fail(`catalog.items[${n}].slug`);
  if(!['grocery','medicine','generic'].includes(it.kind))fail(`catalog.items[${n}].kind`);
  if(it.gtin!==undefined&&!gtinIsValid(String(it.gtin)))fail(`catalog.items[${n}].gtin (dígito verificador)`);
  if(!['l','ml','kg','g','unit','dose'].includes(it.unitBase)||!(Number(it.unitQty)>0))fail(`catalog.items[${n}].unidad`);
  if(it.presentation){const p=parsePresentation(it.presentation);if(p&&(p.unitBase!==it.unitBase||p.unitQty!==Number(it.unitQty)))fail(`catalog.items[${n}].presentación no coincide con la unidad`);}
  const rx=it.kind==='medicine'&&it.rxRequired!==false;
  const entry={...it,rx};
  if(it.code)byCode.set(normalize(it.code),entry);
  if(it.gtin)byGtin.set(String(it.gtin),entry);
  if(!rx)catalogPayloads.push({actionId:derived(fileSha256,'catalog:'+it.slug),slug:it.slug,kind:it.kind,name:it.name,category:it.category,
   ...(it.gtin?{gtin:String(it.gtin)}:{}),...(it.code?{officialCode:('meic:'+normalize(it.code).replace(/ /g,'-')).slice(0,60)}:{}),
   ...(it.brand?{brand:it.brand}:{}),...(it.presentation?{presentation:it.presentation}:{}),unitBase:it.unitBase,unitQty:Number(it.unitQty),
   ...(it.kind==='medicine'?{rxRequired:false}:{}),...(it.aliases?{aliases:it.aliases}:{}),sourceId:'meic'});
 }
 const placeList=Array.isArray(places?.places)?places.places:fail('places.places');
 const placeMap=new Map(placeList.map(p=>[normalize(p.establishment)+'|'+normalize(p.canton??''),p.placeSlug]));
 const placeAny=new Map(placeList.map(p=>[normalize(p.establishment),p.placeSlug]));

 const table=parseCsv(csvText);if(table.length<2)fail('el archivo no tiene filas');
 const header=table[0].map(h=>normalize(h).replace(/ /g,'_'));
 const idx=Object.fromEntries(MEIC_COLUMNS.map(c=>[c,header.indexOf(c)]));
 for(const c of ['producto','comercio','precio'])if(idx[c]<0)fail('falta la columna '+c);
 if(idx.codigo_producto<0&&idx.gtin<0)fail('falta codigo_producto o gtin');
 if(table.length-1>5000)fail('más de 5000 filas: divida el archivo');
 const cell=(r,c)=>idx[c]>=0?String(r[idx[c]]??'').trim():'';
 const rows=table.slice(1).map((r,k)=>{
  const rowNo=k+1,label=[cell(r,'producto'),cell(r,'presentacion')].filter(Boolean).join(' · ').slice(0,200);
  const establishment=cell(r,'comercio').slice(0,200),region=[cell(r,'canton'),cell(r,'provincia')].filter(Boolean).join(', ').slice(0,120);
  const base={rowNo,productLabel:label,establishment,...(region?{region}:{})};
  const gtin=cell(r,'gtin');
  if(gtin&&!gtinIsValid(gtin))return {...base,status:'invalid',reason:'gtin'};
  const item=(gtin&&byGtin.get(gtin))||byCode.get(normalize(cell(r,'codigo_producto')));
  if(!item)return {...base,status:'unknown_item',reason:'item'};
  // Decreto 36868-S: a prescription product never travels with its price.
  if(item.rx)return {...base,status:'rx_refused',reason:'rx'};
  const price=parsePrice(cell(r,'precio'));
  if(price==null)return {...base,status:'invalid',reason:'price'};
  const placeSlug=placeMap.get(normalize(establishment)+'|'+normalize(cell(r,'canton')))??placeAny.get(normalize(establishment));
  return {...base,itemSlug:item.slug,price,...(placeSlug?{placeSlug}:{})};
 });
 const importPayload={actionId:derived(fileSha256,'import'),sourceId:'meic',sourceUrl:meta.sourceUrl,publicationDate:meta.publicationDate,surveyRef:meta.surveyRef.trim(),
  fileName,fileSha256,fileFormat,...(meta.licenseNote?{licenseNote:String(meta.licenseNote).slice(0,300)}:{}),...(meta.validTo?{validTo:meta.validTo}:{}),rows};
 const counts=rows.reduce((a,r)=>{const k=r.status??(r.placeSlug?'to_record':'unmatched_place');a[k]=(a[k]??0)+1;return a;},{});
 return {fileSha256,catalog:catalogPayloads,import:importPayload,counts};
}

async function main(argv){
 const arg=n=>{const i=argv.indexOf(n);return i>=0?argv[i+1]:undefined;};
 const metaPath=arg('--meta'),catalogPath=arg('--catalog'),placesPath=arg('--places'),out=arg('--out');
 if(!metaPath||!catalogPath||!placesPath){console.error('Uso: node scripts/directory/import-meic-prices.mjs --meta <meta.json> --catalog <catalog.json> --places <places.json> [--out <dir>]');process.exit(2);}
 for(const p of [metaPath,catalogPath,placesPath])if(/^[a-z][a-z0-9+.-]*:\/\//i.test(p)){console.error('Solo archivos locales: no se descargan URLs.');process.exit(2);}
 const meta=JSON.parse(await readFile(metaPath,'utf8'));
 if(typeof meta.file!=='string'||/^[a-z][a-z0-9+.-]*:\/\//i.test(meta.file)){console.error('meta.file debe ser un archivo local.');process.exit(2);}
 const csvPath=resolve(dirname(metaPath),meta.file),csvText=await readFile(csvPath,'utf8');
 const built=buildMeicPayloads({meta,catalog:JSON.parse(await readFile(catalogPath,'utf8')),places:JSON.parse(await readFile(placesPath,'utf8')),csvText,fileName:basename(csvPath)});
 if(out){await mkdir(out,{recursive:true});await writeFile(join(out,'meic-catalog.json'),JSON.stringify(built.catalog,null,1));await writeFile(join(out,'meic-import.json'),JSON.stringify(built.import,null,1));
  console.log(`OK ${built.import.surveyRef} sha256=${built.fileSha256}: ${built.import.rows.length} filas ${JSON.stringify(built.counts)} → ${out}`);}
 else console.log(JSON.stringify(built,null,1));
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exit(1);});
