#!/usr/bin/env node
// OSM classification cleanup (owner 2026-11-27: «A169 - DEPOSITO ADUANERO ENCASPI S.A.» under Supermercados). Applies the
// mis-hit rules of stage-import.mjs (osmMisHit: customs/bonded warehouses, private couriers as «Trámites», office
// buildings as malls, company head offices, professional associations as schools, butchers/bazaars tagged as
// supermarkets…) to places ALREADY imported, through the normal staff/import paths with history:
//   * moved  → dir_import_reclassify (source osm, from → to, one call per pair; slug, reviews and photos stay);
//   * hidden → dir_place_mutate action 'status' → 'hidden' (reversible, before/after in dir_place_history).
// Only published (hide) / not removed (move), UNCLAIMED places are touched; claimed ones are reported and kept.
// Idempotent: the plan is computed against the current state (already moved/hidden rows drop out) and action ids are
// derived from the actor + reference (hide) or the exact move input (reclassify), so a re-run changes nothing.
//
//   source ~/bin/pro-local-env.sh
//   node scripts/directory/osm-reclassify-cleanup.mjs [--apply] [--osm <osm-pois.json>] [--actor <staff uuid>] [--remote-ok]
// Dry run by default. Refuses a non-local Supabase URL unless --remote-ok (only with the owner's OK).
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {osmMisHit} from './stage-import.mjs';

const refOf=e=>e.type&&e.id!=null?`${e.type}/${e.id}`:null;
/** Deterministic UUID (v4 layout) from text, for idempotent action ids. */
export const derivedUuid=text=>{const h=createHash('sha256').update(text).digest('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-${'89ab'[parseInt(h[16],16)%4]}${h.slice(17,20)}-${h.slice(20,32)}`;};

/** Pure: OSM elements → [{ref, name, reason, to}] for every element a mis-hit rule fires on (sorted by ref). */
export function misHitCandidates(elements){
 const out=new Map();
 for(const e of elements){const ref=refOf(e),t=e.tags??{};if(!ref||out.has(ref))continue;
  const m=osmMisHit(t);if(m)out.set(ref,{ref,name:t.name??null,reason:m.reason,to:m.to});}
 return [...out.values()].sort((a,b)=>a.ref.localeCompare(b.ref));
}
/** Pure: candidates + current places (ref → place) → actions. Places already in the target state drop out. */
export function cleanupPlan(cands,placeByRef){
 const plan=[];
 for(const c of cands){const p=placeByRef.get(c.ref);if(!p)continue;
  const base={ref:c.ref,reason:c.reason,placeId:p.id,slug:p.slug,name:p.name,from:p.vertical_id};
  if(p.claim_status!=='unclaimed'){plan.push({...base,decision:'claimed_kept'});continue;}
  if(c.to===null){if(p.status==='published')plan.push({...base,decision:'hide',revision:p.revision});continue;}
  if(p.status==='removed'||p.vertical_id===c.to.vertical)continue;
  plan.push({...base,decision:'move',to:c.to.vertical,attributes:c.to.attributes});
 }
 return plan;
}

async function main(){
 const args=process.argv.slice(2),flag=n=>args.includes(n),val=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
 const apply=flag('--apply'),osmFile=val('--osm')??join(homedir(),'dl/osm-data/out-v2/osm-pois.json');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY??process.env.SERVICE_ROLE_KEY;
 if(!url||!key){console.error('Falta NEXT_PUBLIC_SUPABASE_URL / SERVICE_ROLE_KEY (source ~/bin/pro-local-env.sh).');process.exit(2);}
 const host=new URL(url).hostname;
 if(!['127.0.0.1','localhost'].includes(host)&&!flag('--remote-ok')){console.error(`Base de datos no local (${host}): use --remote-ok solo con autorización del dueño.`);process.exit(2);}
 const {createClient}=await import('@supabase/supabase-js');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 let actor=val('--actor');
 if(!actor){const r=await db.from('profiles').select('id').eq('role','admin').order('created_at').limit(1);if(r.error)throw r.error;actor=r.data?.[0]?.id;}
 if(!/^[0-9a-f-]{36}$/i.test(actor??'')){console.error('Indique --actor <uuid de personal>.');process.exit(2);}

 const cands=misHitCandidates(JSON.parse(await readFile(osmFile,'utf8')).elements??[]);
 // OSM ref → place (name provenance, like dir_import_ref_place).
 const placeByRef=new Map();
 for(let i=0;i<cands.length;i+=200){
  const refs=cands.slice(i,i+200).map(c=>c.ref);
  const f=await db.from('dir_field_provenance').select('source_ref,place_id').eq('source_id','osm').eq('field','name').in('source_ref',refs);
  if(f.error)throw f.error;
  const ids=[...new Set(f.data.map(x=>x.place_id))];if(!ids.length)continue;
  const p=await db.from('dir_places').select('id,slug,name,vertical_id,status,claim_status,revision').in('id',ids);
  if(p.error)throw p.error;const byId=new Map(p.data.map(x=>[x.id,x]));
  for(const x of f.data)if(byId.has(x.place_id)&&!placeByRef.has(x.source_ref))placeByRef.set(x.source_ref,byId.get(x.place_id));
 }
 const plan=cleanupPlan(cands,placeByRef);
 const counts={};for(const a of plan){const k=`${a.from} → ${a.decision==='move'?a.to:a.decision}`;counts[k]=(counts[k]??0)+1;}
 console.log(JSON.stringify({osmCandidates:cands.length,imported:placeByRef.size,actions:plan.length,counts},null,1));
 for(const a of plan)console.log(`${a.decision.padEnd(12)} ${a.from.padEnd(14)} ${(a.to??'').padEnd(14)} ${a.reason.padEnd(30)} ${a.ref.padEnd(18)} ${a.name}`);
 if(!apply){console.log('Dry run: no se cambió nada. Use --apply.');return;}

 const result={hidden:0,moved:0,skipped:{}};
 for(const a of plan.filter(x=>x.decision==='hide')){
  const r=await db.rpc('dir_place_mutate',{p_actor:actor,p_input:{action:'status',actionId:derivedUuid(`${actor}:osm-cleanup:hide:${a.ref}`),placeId:a.placeId,revision:a.revision,status:'hidden'}});
  if(r.error)throw new Error(`${a.ref}: ${r.error.message}`);result.hidden++;
 }
 const groups=new Map();
 for(const a of plan.filter(x=>x.decision==='move')){const k=`${a.from}>${a.to}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push({ref:a.ref,attributes:a.attributes});}
 for(const [k,rows] of groups){const [from,to]=k.split('>');
  const input={sourceId:'osm',from,to,rows};
  const r=await db.rpc('dir_import_reclassify',{p_actor:actor,p_input:{actionId:derivedUuid(`${actor}:osm-cleanup:move:${JSON.stringify(input)}`),...input}});
  if(r.error)throw new Error(`${k}: ${r.error.message}`);
  result.moved+=r.data?.moved??0;for(const [why,n] of Object.entries(r.data?.skipped??{}))result.skipped[why]=(result.skipped[why]??0)+n;
 }
 console.log('Aplicado:',JSON.stringify(result));
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await main();
