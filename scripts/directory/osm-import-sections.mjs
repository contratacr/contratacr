#!/usr/bin/env node
// TEST ONLY (2026-11-28). Imports the OSM place sections the encrypted seed package predates (Parqueos, Lavacar,
// Atracciones, Tiendas, Centros comerciales, Mercados y carnicerías, Trámites, Educación, Transporte and Hospedaje
// «por días») into the database psql points to, the same way the local import of 2026-11-26 did:
//   1. places   stage-import.mjs buildPayloads (--admin-areas, --inside-only, --fuel-points, --only <sections>)
//               → dir_import_stage + dir_import_commit {publish:true}. Rows whose OSM ref (or same name within 75 m)
//               already exists come back «duplicate»; removed places stay out («rejected»).
//   2. extras   stage-osm-extras.mjs buildExtrasPayloads (opening hours, website, e-mail) for the same OSM elements
//               → dir_import_extras_stage + dir_import_extras_commit (never overwrites owner data).
//   3. tours → attraction  dir_import_reclassify for places of «Tours» that classify as attractions today (kind kept
//               from the classifier; unclaimed only; other sections are skipped by the RPC).
// Idempotent: batch and action ids are derived from the file hash and part; a part already committed is skipped and a
// staged one is committed. Dry run by default: every part is staged AND committed inside a transaction that is rolled
// back, so the write path (actor, dir_place_mutate, slugs, attributes) is exercised and the exact counts are printed.
// Usage: node scripts/directory/osm-import-sections.mjs --pois <osm-pois.json> --admin-areas <osm-admin-areas.json> [--apply]
// Needs `psql` in PATH. Refuses any host other than 127.0.0.1/localhost unless PRO_LOCAL_DB_OK is set (run-test-data.mjs
// sets it only after checking the test project).
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildPayloads,loadAdminAreas,loadFuelPoints} from './stage-import.mjs';
import {buildExtrasPayloads} from './stage-osm-extras.mjs';

const ACTOR='c0a7f0e5-0000-4000-8000-000000000536';// the system actor the importer already uses
export const SECTIONS=Object.freeze(['parking','car_wash','attraction','retail','mall','food_shop','government','education','transport','lodging']);
const args=process.argv.slice(2),apply=args.includes('--apply'),val=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
const poisPath=val('--pois'),areasPath=val('--admin-areas');
if(!poisPath||!areasPath){console.error('Uso / usage: osm-import-sections.mjs --pois <osm-pois.json> --admin-areas <osm-admin-areas.json> [--apply]');process.exit(2);}

const host=process.env.PGHOST||'';
if(!['127.0.0.1','localhost',''].includes(host)&&!process.env.PRO_LOCAL_DB_OK){console.error(`Rechazado: la base ${host} no es local. / Refused: not a local database.`);process.exit(2);}
function psql(sql){
 const r=spawnSync('psql',['-X','-q','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:1<<28});
 if(r.status!==0){console.error((r.stderr||'').slice(0,4000));process.exit(1);}
 return r.stdout;
}
const uuidOf=s=>{const h=createHash('sha256').update(s).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const lit=json=>{const text=JSON.stringify(json);let tag;do tag=`p${randomBytes(6).toString('hex')}`;while(text.includes(tag));return `$${tag}$${text}$${tag}$::jsonb`;};
const q=s=>`'${String(s).replace(/'/g,"''")}'`;
const HEAD="set statement_timeout=0; set lock_timeout='30s';\n";

const text=readFileSync(poisPath,'utf8');
const opts={allowPhone:true,insideOnly:true,adminAreas:loadAdminAreas(readFileSync(areasPath,'utf8')),only:[...SECTIONS],review:[],fuelPoints:loadFuelPoints(text)};
const built=buildPayloads(text,'osm','osm-pois.json',opts);
const sha=built.payloads[0]?.fileSha256;
// Parts start at 101 so they never collide with an earlier import of the same extract file (unique source+sha+part).
const payloads=built.payloads.map(p=>({...p,part:100+p.part,actionId:uuidOf(`osm-sections:stage:${p.fileSha256}:${p.part}`),batchId:uuidOf(`osm-sections:batch:${p.fileSha256}:${p.part}`)}));
console.log(`Mode: ${apply?'APPLY':'dry run (rolled back)'} · rows: ${built.total} · parts: ${payloads.length} · outside CR: ${built.outside} · near fuel: ${built.nearFuel} · nearby duplicates: ${built.deduped}`);
const perVertical={};for(const p of payloads)for(const r of p.rows)perVertical[r.vertical]=(perVertical[r.vertical]??0)+1;
console.log('Candidates per section:',JSON.stringify(perVertical));
if(!payloads.length){console.log('Nothing to import.');process.exit(0);}

const before=JSON.parse(psql(`select coalesce(jsonb_object_agg(vertical_id,n),'{}') from (select vertical_id,count(*) n from public.dir_places where status='published' group by 1) t;`)||'{}');

// ---- 1. places
const report=`select coalesce(jsonb_object_agg(k,n),'{}') from (select vertical_id||' '||status||coalesce(':'||reason,'') k,count(*) n from public.dir_import_rows where batch_id=%BID% group by 1) t;`;
const totals={};
for(const p of payloads){
 const state=psql(`select status from public.dir_import_batches where source_id='osm' and file_sha256=${q(sha)} and part=${p.part};`).trim();
 if(state==='committed'){console.log(`part ${p.part}: already committed, skipped`);continue;}
 const commit={actionId:uuidOf(`osm-sections:commit:${sha}:${p.part}`),batchId:p.batchId,publish:true};
 let bid=p.batchId;
 if(state==='staged'){bid=psql(`select id from public.dir_import_batches where source_id='osm' and file_sha256=${q(sha)} and part=${p.part};`).trim();commit.batchId=bid;}
 const sql=HEAD+'begin;\n'+(state?'':`select public.dir_import_stage(${q(ACTOR)}::uuid,${lit(p)}) is null;\n`)+
  `select public.dir_import_commit(${q(ACTOR)}::uuid,${lit(commit)}) is null;\n`+report.replace('%BID%',`${q(bid)}::uuid`)+'\n'+(apply?'commit;':'rollback;');
 const out=JSON.parse(psql(sql).trim().split('\n').pop()||'{}');
 for(const [k,n] of Object.entries(out))totals[k]=(totals[k]??0)+n;
 console.log(`part ${p.part}: ${JSON.stringify(out)}`);
}
console.log('Places, total:',JSON.stringify(totals,Object.keys(totals).sort()));

// ---- 2. extras (hours, website, e-mail) for the same OSM elements
const refs=new Set(payloads.flatMap(p=>p.rows.map(r=>r.ref)));
const elements=JSON.parse(text).elements.filter(e=>refs.has(`${e.type}/${e.id}`));
const extrasText=JSON.stringify({elements});
const {payloads:extras,stats}=buildExtrasPayloads(extrasText,'osm','osm-pois-sections.json',{partStart:101});
console.log(`Extras: hours ${stats.hoursParsed} · website ${stats.websiteValid} · e-mail ${stats.emailValid} · parts ${extras.length}`);
if(apply){
 for(const x of extras){
  const xs=x.fileSha256,state=psql(`select status||' '||id from public.dir_import_extra_batches where source_id='osm' and file_sha256=${q(xs)} and part=${x.part};`).trim();
  if(state.startsWith('committed')){console.log(`extras part ${x.part}: already committed, skipped`);continue;}
  const payload={...x,actionId:uuidOf(`osm-sections:extras-stage:${xs}:${x.part}`),batchId:uuidOf(`osm-sections:extras-batch:${xs}:${x.part}`)};
  const bid=state?state.split(' ')[1]:payload.batchId;
  const sql=HEAD+'begin;\n'+(state?'':`select public.dir_import_extras_stage(${q(ACTOR)}::uuid,${lit(payload)}) is null;\n`)+
   `select public.dir_import_extras_commit(${q(ACTOR)}::uuid,${lit({actionId:uuidOf(`osm-sections:extras-commit:${xs}:${x.part}`),batchId:bid})});\ncommit;`;
  console.log(`extras part ${x.part}: ${psql(sql).trim().split('\n').pop()}`);
 }
}else console.log('Extras: dry run, not staged (they attach to the places above).');

// ---- 3. tours → attraction
const moves=payloads.flatMap(p=>p.rows.filter(r=>r.vertical==='attraction').map(r=>({ref:r.ref,attributes:r.attributes&&typeof r.attributes==='object'?{kind:r.attributes.kind}:{}})))
 .map(r=>r.attributes.kind?r:{ref:r.ref});
for(let i=0;i<moves.length;i+=5000){
 const input={sourceId:'osm',from:'tours',to:'attraction',rows:moves.slice(i,i+5000)};
 const call={actionId:uuidOf(`osm-sections:tours-attraction:${createHash('sha256').update(JSON.stringify(input)).digest('hex')}`),...input};
 console.log(`tours → attraction: ${psql(HEAD+`begin;\nselect public.dir_import_reclassify(${q(ACTOR)}::uuid,${lit(call)});\n${apply?'commit;':'rollback;'}`).trim().split('\n').pop()}`);
}

const after=JSON.parse(psql(`select coalesce(jsonb_object_agg(vertical_id,n),'{}') from (select vertical_id,count(*) n from public.dir_places where status='published' group by 1) t;`)||'{}');
console.table([...new Set([...Object.keys(before),...Object.keys(after)])].sort().map(v=>({section:v,before:before[v]??0,after:after[v]??0})));
if(!apply)console.log('Dry run: nothing was written. Use --apply.');
