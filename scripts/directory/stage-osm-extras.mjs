#!/usr/bin/env node
// LOCAL PRO ONLY (multivertical F2 extras). Offline: reads ONE local OSM file (Overpass JSON or OSM-style GeoJSON, the
// same dump used by stage-import.mjs) and prints dir_import_extras_stage payloads with ONLY two OSM fields per element:
// opening_hours (parsed by osm-opening-hours.mjs; unparseable values are staged without hours and never imported)
// and website / contact:website (osm-website.mjs; rejected values are staged without a URL), plus (2026-11-17, claim
// by e-mail) email / contact:email (osm-email.mjs; rejected values are staged without an address) with the element's
// upstream edit date (Overpass `timestamp` / GeoJSON `@timestamp`) when the dump has it. Nothing else is copied.
// Usage: node scripts/directory/stage-osm-extras.mjs <local-file> <source-id> [--out <dir>] [--only email] [--part-start N]
//  --only email   rows carry only the e-mail (a second pass over a file whose hours/website were already staged);
//  --part-start N first batch part number (the database keeps one batch per file+part).
// No network access, no database connection: apply with dir_import_extras_stage / dir_import_extras_commit (service
// role). The database decides which place each reference belongs to and never overwrites owner data.
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseOpeningHours} from './osm-opening-hours.mjs';
import {normalizeWebsite} from './osm-website.mjs';
import {normalizeOsmEmail} from './osm-email.mjs';

export const EXTRAS_PART_SIZE=5000;
const clip=(text,max)=>typeof text==='string'&&text.trim()?text.trim().slice(0,max):undefined;

function elements(data){
 if(data?.type==='FeatureCollection'&&Array.isArray(data.features))return data.features.map(f=>{const p=f?.properties??{},tags=p.tags&&typeof p.tags==='object'?p.tags:p;
  const id=p['@id']??f.id??(p.osm_type&&p.osm_id?`${p.osm_type}/${p.osm_id}`:null);return {ref:typeof id==='string'||typeof id==='number'?String(id):null,tags,editedAt:p['@timestamp']??p.timestamp};});
 if(Array.isArray(data?.elements))return data.elements.map(e=>({ref:e.type&&e.id!=null?`${e.type}/${e.id}`:null,tags:e.tags??{},editedAt:e.timestamp}));
 throw new Error('Formato no reconocido: use GeoJSON FeatureCollection o JSON de Overpass. / Unknown format.');
}

const isoDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v)&&!Number.isNaN(Date.parse(v))?v:undefined;
/** Pure: file text → {rows, stats}. A row exists only for elements with opening_hours, a website and/or an e-mail tag. */
export function parseExtras(text,{only}={}){
 const rows=[],stats={elements:0,withHours:0,hoursParsed:0,hoursUnparseable:0,hoursReasons:{},withWebsite:0,websiteValid:0,websiteRejected:0,websiteReasons:{},withEmail:0,emailValid:0,emailRejected:0,emailReasons:{}};
 const seen=new Set(),emailOnly=only==='email';
 for(const {ref,tags,editedAt} of elements(JSON.parse(text))){
  stats.elements++;
  if(!ref||!/^[A-Za-z0-9:/._-]{1,120}$/.test(ref)||seen.has(ref))continue;
  const rawHours=emailOnly?undefined:clip(tags.opening_hours,255),rawSite=emailOnly?undefined:clip(tags.website??tags['contact:website'],500),rawEmail=clip(tags.email??tags['contact:email'],254);
  if(!rawHours&&!rawSite&&!rawEmail)continue;
  seen.add(ref);const row={ref};
  if(rawHours){
   stats.withHours++;row.hoursRaw=rawHours;const h=parseOpeningHours(rawHours);
   if(h.ok){stats.hoursParsed++;row.hours=h.slots;}else{stats.hoursUnparseable++;stats.hoursReasons[h.reason]=(stats.hoursReasons[h.reason]??0)+1;}
  }
  if(rawSite){
   stats.withWebsite++;row.websiteRaw=rawSite;const w=normalizeWebsite(rawSite);
   if(w.ok){stats.websiteValid++;row.website=w.url;}else{stats.websiteRejected++;stats.websiteReasons[w.reason]=(stats.websiteReasons[w.reason]??0)+1;}
  }
  if(rawEmail){
   stats.withEmail++;row.emailRaw=rawEmail;const e=normalizeOsmEmail(rawEmail);
   if(e.ok){stats.emailValid++;row.email=e.email;const at=isoDate(editedAt);if(at)row.emailEditedAt=at;}
   else{stats.emailRejected++;stats.emailReasons[e.reason]=(stats.emailReasons[e.reason]??0)+1;}
  }
  rows.push(row);
 }
 return {rows,stats};
}
export function buildExtrasPayloads(text,sourceId,fileName,{only,partStart=1}={}){
 if(!/^[a-z][a-z0-9_-]{1,40}$/.test(sourceId))throw new Error('source-id inválido / invalid source-id');
 if(only!==undefined&&only!=='email')throw new Error('--only admite solo «email» / --only accepts only «email»');
 if(!Number.isInteger(partStart)||partStart<1||partStart>1000)throw new Error('--part-start inválido / invalid --part-start');
 const {rows,stats}=parseExtras(text,{only}),sha=createHash('sha256').update(text).digest('hex'),payloads=[];
 for(let i=0;i<rows.length;i+=EXTRAS_PART_SIZE)payloads.push({actionId:randomUUID(),batchId:randomUUID(),sourceId,fileName:fileName.slice(0,200),fileSha256:sha,part:partStart+payloads.length,rows:rows.slice(i,i+EXTRAS_PART_SIZE)});
 return {payloads,stats};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 const args=process.argv.slice(2),flag=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
 const out=flag('--out')??null,only=flag('--only'),partStart=flag('--part-start')?Number(flag('--part-start')):1;
 const valueIdx=new Set(['--out','--only','--part-start'].map(n=>args.indexOf(n)).filter(i=>i>=0).map(i=>i+1));
 const [file,sourceId]=args.filter((a,i)=>!a.startsWith('--')&&!valueIdx.has(i));
 if(!file||!sourceId){console.error('Uso / usage: node scripts/directory/stage-osm-extras.mjs <archivo-local> <source-id> [--out <dir>]');process.exit(2);}
 if(/^[a-z]+:\/\//i.test(file)){console.error('Solo archivos locales / local files only');process.exit(2);}
 const text=await readFile(file,'utf8'),{payloads,stats}=buildExtrasPayloads(text,sourceId,basename(file),{only,partStart});
 if(out){await mkdir(out,{recursive:true});for(const p of payloads)await writeFile(join(out,`extras-${p.part}.json`),JSON.stringify(p));}
 else process.stdout.write(JSON.stringify(payloads)+'\n');
 console.error(`Horario OSM / opening_hours: ${stats.withHours} · interpretables / parsed: ${stats.hoursParsed} · omitidos por no interpretables / skipped unparseable: ${stats.hoursUnparseable} ${JSON.stringify(stats.hoursReasons)}`);
 console.error(`Sitio web OSM / website: ${stats.withWebsite} · válidos / valid: ${stats.websiteValid} · rechazados / rejected: ${stats.websiteRejected} ${JSON.stringify(stats.websiteReasons)}`);
 console.error(`Correo OSM / email: ${stats.withEmail} · válidos / valid: ${stats.emailValid} · rechazados / rejected: ${stats.emailRejected} ${JSON.stringify(stats.emailReasons)}`);
 console.error(`Filas / rows: ${payloads.reduce((n,p)=>n+p.rows.length,0)} · lotes / batches: ${payloads.length}`);
}
