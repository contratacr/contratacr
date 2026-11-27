#!/usr/bin/env node
// LOCAL PRO ONLY (2026-11-27). Backfill of contact data for places that were already imported from OpenStreetMap:
// phone (normalized «+506XXXXXXXX»), attributes.whatsapp and attributes.social, read from the same OSM extract the
// import used (output of osm-pbf-to-json.py, Overpass-style JSON). Matching: the OSM id stored on each place
// (dir_field_provenance source 'osm', field 'name', source_ref «node/123»). Only EMPTY fields are filled; claimed,
// removed or owner-edited values are never touched. Every write goes through the dir_place_mutate RPC (action 'update':
// revision check, history, provenance 'osm' + ref), one transaction, deterministic action ids → safe to re-run.
// Dry-run by default (prints before/after counts per section, writes nothing); --apply writes.
// Usage: node scripts/directory/backfill-contacts.mjs [--pois ~/dl/osm-data/out-v2/osm-pois.json] [--apply]
// Needs `psql` in PATH (local Supabase: source ~/bin/pro-local-env.sh). Refuses any host other than 127.0.0.1/localhost
// unless PRO_LOCAL_DB_OK is set (test/prod only with the owner's OK).
// No network access, no website scraping.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {phoneFromTags,whatsappFromTags} from './osm-contact.mjs';
import {socialFromTags} from './osm-social.mjs';

const ACTOR='c0a7f0e5-0000-4000-8000-000000000536';// the system actor the importer already uses
const args=process.argv.slice(2),apply=args.includes('--apply');
const poisPath=args.includes('--pois')?args[args.indexOf('--pois')+1]:join(homedir(),'dl/osm-data/out-v2/osm-pois.json');

function psql(sql){
 const host=process.env.PGHOST||new URL(process.env.SUPABASE_DB_URL||'postgresql://x@localhost/x').hostname;
 if(!['127.0.0.1','localhost',''].includes(host)&&!process.env.PRO_LOCAL_DB_OK){console.error(`Rechazado: la base ${host} no es local. / Refused: not a local database.`);process.exit(2);}
 const r=spawnSync('psql',['-X','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:1<<28});
 if(r.status!==0){console.error(r.stderr);process.exit(1);}
 return r.stdout;
}
const uuidOf=s=>{const h=createHash('sha256').update(s).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const counts=()=>JSON.parse(psql(`select coalesce(jsonb_object_agg(v,j),'{}') from (select vertical_id v,jsonb_build_object('places',count(*),'phone',count(phone),'whatsapp',count(attributes->>'whatsapp'),'social',count(*) filter(where attributes?'social')) j from dir_places where status<>'removed' group by 1) t;`));

// OSM extract → candidate contact values per OSM ref.
const cand=new Map();
for(const e of JSON.parse(readFileSync(poisPath,'utf8')).elements){
 const phone=phoneFromTags(e.tags),whatsapp=whatsappFromTags(e.tags),social=socialFromTags(e.tags);
 if(phone||whatsapp||social)cand.set(`${e.type}/${e.id}`,{ref:`${e.type}/${e.id}`,phone:phone??null,attrs:{...(whatsapp?{whatsapp}:{}),...(social?{social}:{})}});
}
console.log(`OSM: ${cand.size} elementos con teléfono, WhatsApp o redes / elements with phone, WhatsApp or social links`);
const before=counts();

// One statement: for each candidate whose place exists, is not removed/claimed and has an EMPTY field to fill, call the RPC.
const payload=JSON.stringify([...cand.values()].map(c=>({...c,aid:uuidOf(`contacts-backfill-v1:${c.ref}`)})));
if(payload.includes('$j$')){console.error('payload');process.exit(1);}
const body=`
with v as (select * from jsonb_to_recordset($j$${payload}$j$::jsonb) as x(ref text,phone text,attrs jsonb,aid uuid)),
 target as (
  select distinct on (v.ref) v.*,p.id pid,p.revision,p.phone cur_phone,p.attributes cur,
   (select jsonb_object_agg(k,val) from jsonb_each(v.attrs) e(k,val) where not p.attributes ? k) new_attrs
  from v join dir_field_provenance f on f.source_id='osm' and f.field='name' and f.source_ref=v.ref
  join dir_places p on p.id=f.place_id
  where p.status<>'removed' and p.claim_status='unclaimed'
   and not exists(select 1 from dir_place_managers m where m.place_id=p.id and m.status='active')
  order by v.ref,f.id),
 patch as (
  select t.*,(case when t.cur_phone is null and t.phone is not null then jsonb_build_object('phone',t.phone) else '{}'::jsonb end)
   ||(case when t.new_attrs is not null then jsonb_build_object('attributes',t.cur||t.new_attrs) else '{}'::jsonb end) place
  from target t)
`;
const todo=JSON.parse(psql(`${body} select coalesce(jsonb_agg(jsonb_build_object('ref',ref,'place',place)),'[]') from patch where place<>'{}'::jsonb;`));
const n={phone:0,whatsapp:0,social:0};for(const t of todo){if(t.place.phone)n.phone++;if(t.place.attributes?.whatsapp)n.whatsapp++;if(t.place.attributes?.social)n.social++;}
console.log(`Por rellenar / to fill: ${todo.length} lugares · teléfonos ${n.phone} · WhatsApp ${n.whatsapp} · redes ${n.social}`);
if(apply&&todo.length){
 const out=psql(`begin;${body} select count(dir_place_mutate('${ACTOR}'::uuid,jsonb_build_object('action','update','actionId',aid,'placeId',pid,'revision',revision,'place',place,
  'source',jsonb_build_object('id','osm','ref',ref,'observedAt',now())))) from patch where place<>'{}'::jsonb; commit;`);
 console.log(`Aplicado / applied: ${out.trim().split('\n').pop()} lugares`);
}
const after=apply?counts():before;
const rows=Object.keys(after).sort().map(v=>({section:v,places:after[v].places,'phone before':before[v]?.phone,'phone after':after[v].phone,'wa before':before[v]?.whatsapp,'wa after':after[v].whatsapp,'social before':before[v]?.social,'social after':after[v].social}));
console.table(rows);
if(!apply)console.log('Simulación: no se escribió nada. Use --apply. / Dry run: nothing written.');
