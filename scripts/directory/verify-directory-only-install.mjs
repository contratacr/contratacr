// LOCAL ONLY (launch without Pro, 2026-11-18): proves the production migration order of the DIRECTORY-ONLY launch
// (docs: scratchpad launch2/migrations-directorio.md) on a FRESH in-memory PGlite database with only the Supabase roles
// (anon, authenticated, service_role) and an empty storage stub — no Pro module, no shared database, no network.
// * Applies DIRECTORY_ONLY_SQL in order, then the whole list again (every file must be idempotent).
// * Asserts: no pro_* table/function except the directory menu (pro_menu_*, legacy names, no Pro dependency); every
//   public dir_/app_/price_/pro_menu_ function and table refuses anon/authenticated; RLS on every table.
// * Smoke over the public readers and the owner tools with a claimed place (no Pro team module installed).
// Usage: node scripts/directory/verify-directory-only-install.mjs [--print]   (--print lists the order and exits)
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export const DIRECTORY_ONLY_SQL=Object.freeze([
 'rate-limit-buckets-local.sql',
 'directory-core-local.sql',
 'directory-import-local.sql',
 'directory-claims-local.sql',
 'dir-business-roles-local.sql',
 'directory-reviews-local.sql',
 'directory-search-local.sql',
 'price-observations-local.sql',
 'directory-moderation-local.sql',
 'directory-import-extras-local.sql',
 'price-compare-local.sql',
 'pro-menu-local.sql',
 'directory-price-search-local.sql',
 'directory-place-tools-local.sql',
 'directory-owner-profile-local.sql',
 'directory-reservations-local.sql',
 'directory-questions-local.sql',
 'directory-saved-lists-local.sql',
 'directory-events-local.sql',
 'directory-brands-local.sql',
 'directory-place-photos-local.sql',
 'price-overview-local.sql',
]);
if(process.argv.includes('--print')){DIRECTORY_ONLY_SQL.forEach((f,i)=>console.log(String(i+1).padStart(2)+' '+f));process.exit(0);}

const dir=process.env.DIR_SQL_DIR||'docs/pro/sql';
const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
for(const round of [1,2])for(const f of DIRECTORY_ONLY_SQL){
 try{await db.exec(await readFile(`${dir}/${f}`,'utf8'));}catch(e){throw new Error(`round ${round}: ${f} failed: ${e.message}`,{cause:e});}
}
const q=async(t,p=[])=>(await db.query(t,p)).rows;
const proFns=(await q(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\\_%' and p.proname not like 'pro\\_menu\\_%'`)).map(r=>r.proname);
assert.deepEqual(proFns,[],'no Pro function installed');
const proRels=(await q(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','v','m') and c.relname like 'pro\\_%' and c.relname not like 'pro\\_menu\\_%'`)).map(r=>r.relname);
assert.deepEqual(proRels,[],'no Pro table installed');
const tables=(await q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`));
assert.ok(tables.length>=55,'directory tables installed: '+tables.length);
assert.deepEqual(tables.filter(t=>!t.relrowsecurity).map(t=>t.relname),[],'RLS on every table');
for(const role of ['anon','authenticated']){
 const fns=(await q(`select p.oid::regprocedure::text s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege($1,p.oid,'EXECUTE')`,[role])).map(r=>r.s);
 assert.deepEqual(fns,[],role+' executes no public function');
 const tbl=(await q(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and (has_table_privilege($1,c.oid,'SELECT') or has_table_privilege($1,c.oid,'INSERT') or has_table_privilege($1,c.oid,'UPDATE') or has_table_privilege($1,c.oid,'DELETE'))`,[role])).map(r=>r.relname);
 assert.deepEqual(tbl,[],role+' touches no public table');
}
const counts=(await q(`select (select count(*)::int from dir_verticals) v,(select count(*)::int from dir_data_sources) s,(select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') f`))[0];
assert.ok(counts.v>=17&&counts.s>=3);

// ---------------------------------------------------------------- smoke (as service_role, like the app)
await db.exec(`update dir_claim_settings set sms_enabled=true;set role service_role`);
const uuid=()=>crypto.randomUUID(),id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),hex=s=>createHash('sha256').update(s).digest('hex');
const call=async(fn,a,i)=>(await q(`select ${fn}($1,$2) r`,[a,i]))[0].r,call3=async(fn,a,m,i)=>(await q(`select ${fn}($1,$2,$3) r`,[a,m,i]))[0].r;
const staff=id(0xaa),owner=id(0xd1),member=id(0xe2);
const r=await call('dir_place_mutate',staff,{actionId:uuid(),action:'create',placeId:id(1),revision:0,source:{id:'osm',ref:'node/1'},verificationLevel:'imported',
 place:{slug:'soda-uno',vertical:'restaurant',name:'Soda Uno',adminArea1:'San José',lat:9.93,lng:-84.08,phone:'+506 2200 1001'}});
await call('dir_place_mutate',staff,{actionId:uuid(),action:'status',placeId:id(1),revision:r.revision,status:'published'});
assert.equal((await q(`select dir_place_public('soda-uno')->>'name' n`))[0].n,'Soda Uno');
const s=(await q(`select dir_search('restaurantes',null,'{}'::jsonb) r`))[0].r;assert.ok(JSON.stringify(s).includes('soda-uno'),'search finds the place');
await q(`select dir_search('lugares','soda','{}'::jsonb)`);await q(`select dir_facets('restaurantes')`);
const cl=await call('dir_claim_open',owner,{actionId:uuid(),claimId:uuid(),slug:'soda-uno',method:'phone_listed'});
await call('dir_claim_send_code',owner,{actionId:uuid(),claimId:cl.claimId,codeHash:hex('c')});
assert.equal((await call('dir_claim_verify_code',owner,{actionId:uuid(),claimId:cl.claimId,codeHash:hex('c')})).status,'approved');
const prof=await call3('dir_owner_place_read',owner,null,id(1));
await call3('dir_owner_place_update',owner,null,{actionId:uuid(),placeId:id(1),revision:prof.revision,action:'hours',hours:[{weekday:1,opens:'07:00',closes:'15:00'}]});
const menu=await call3('pro_menu_read',owner,null,id(1));assert.ok(menu&&typeof menu==='object','menu editor reads without Pro');
await assert.rejects(()=>call3('pro_menu_read',owner,member,id(1)),e=>e.code==='42501','member identity refused without Pro');
await call3('dir_order_link_mutate',owner,null,{actionId:uuid(),placeId:id(1),revision:0,channel:'phone',value:'+506 2222 3333'});
await q(`select dir_place_menu_public('soda-uno')`);
assert.ok((await q(`select app_rate_limit_take($1,5,60000) r`,[hex('k')]))[0].r!==undefined,'rate limiter');
console.log(`PASS: directory-only install — ${DIRECTORY_ONLY_SQL.length} modules applied twice on a fresh PGlite (roles + empty storage stub only); ${tables.length} tables (RLS on, none reachable by anon/authenticated), ${counts.f} functions (none executable by anon/authenticated), 0 Pro tables/functions (menu keeps its pro_menu_* names); smoke: publish, public page, search/facets, e-mail-less phone claim, owner hours, menu read, member refused, «Pedir».`);
