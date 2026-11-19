// LOCAL PRO ONLY (place features round, 2026-11-17): shared in-memory PGlite set-up for the DB verifiers of the
// reservations, Q&A, saved lists, events, brands and «Pedir» modules. Loads the directory modules they build on (core,
// import, claims, reviews, price observations, moderation, place tools) plus the module under test (applied twice:
// idempotent), and a minimal stand-in for the team-roles helpers (pro_role_of / pro_role_allows, same matrix as
// pro-editions-team-gate-local.sql). SQL is read from DIR_SQL_DIR (default docs/pro/sql). Never opens a real database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

export const uuid=()=>crypto.randomUUID();
export const hex=s=>createHash('sha256').update(s).digest('hex');
export const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
export const code=c=>e=>{assert.equal(e.code,c,`${c} expected, got ${e.code}: ${e.message}`);return true;};
export const hint=(h,c)=>e=>{assert.equal(e.hint,h,`${h} expected, got ${e.code}/${e.hint}: ${e.message}`);if(c)assert.equal(e.code,c);return true;};

export async function setup(modules,{teamStandIn=true}={}){
 const dir=process.env.DIR_SQL_DIR||'docs/pro/sql';
 const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;`);
 const base=['directory-core-local.sql','directory-import-local.sql','directory-claims-local.sql','dir-business-roles-local.sql','directory-reviews-local.sql','price-observations-local.sql','directory-moderation-local.sql','directory-place-tools-local.sql'];
 for(const f of [...base,...modules,...modules])await db.exec(await readFile(join(dir,f),'utf8'));
 // Team roles stand-in (the real helpers live in team-roles-local.sql / pro-editions-team-gate-local.sql).
 await db.exec(`create table test_team(member uuid,owner uuid,role text);grant select on test_team to service_role;
  update dir_claim_settings set sms_enabled=true;`);
 // teamStandIn:false = a database WITHOUT the Pro team module (directory-only launch).
 if(teamStandIn)await db.exec(`
  create function public.pro_role_of(p_actor uuid,p_owner uuid) returns text language sql stable as $$ select role from test_team where member=p_actor and owner=p_owner $$;
  create function public.pro_role_allows(p_role text,p_capability text) returns boolean language sql immutable as $$ select case p_role
   when 'admin' then true when 'manager' then p_capability<>'team.manage' and p_capability<>'settings.write'
   when 'member' then p_capability in('read','work.write','lead.write','inventory.write','menu.write') when 'read_only' then p_capability='read' else false end $$;
`);
 await db.exec('set role service_role');
 const q=async(text,params=[])=>(await db.query(text,params)).rows;
 const call=async(fn,actor,input)=>(await q(`select ${fn}($1,$2) r`,[actor,input]))[0].r;
 const call3=async(fn,actor,member,input)=>(await q(`select ${fn}($1,$2,$3) r`,[actor,member,input]))[0].r;
 const staff=id(0xaa);
 const mutate=input=>call('dir_place_mutate',staff,{actionId:uuid(),...input});
 /** Creates (and publishes) place n with an OSM-like source. */
 const mk=async(n,vertical='restaurant',{publish=true,attributes,name,adminArea1='San José',ref}={})=>{
  const r=await mutate({action:'create',placeId:id(n),revision:0,source:{id:'osm',ref:ref??'node/'+n},verificationLevel:'imported',
   place:{slug:'lugar-'+n,vertical,name:name??'Lugar '+n,adminArea1,lat:9.93,lng:-84.08+n/10000,phone:'+506 2200 '+String(1000+n).slice(-4),...(attributes?{attributes}:{})}});
  if(publish)return (await mutate({action:'status',placeId:id(n),revision:r.revision,status:'published'})).revision;return r.revision;};
 /** Claims place n for `owner` with the phone code (SMS switch on in this in-memory DB only). */
 const claim=async(n,owner)=>{
  const cl=await call('dir_claim_open',owner,{actionId:uuid(),claimId:uuid(),slug:'lugar-'+n,method:'phone_listed'});
  await call('dir_claim_send_code',owner,{actionId:uuid(),claimId:cl.claimId,codeHash:hex('c'+n)});
  assert.equal((await call('dir_claim_verify_code',owner,{actionId:uuid(),claimId:cl.claimId,codeHash:hex('c'+n)})).status,'approved');};
 const team=async(member,owner,role)=>{await db.exec('reset role');await db.query('insert into test_team values($1,$2,$3)',[member,owner,role]);await db.exec('set role service_role');};
 /** anon/authenticated can neither read the tables nor execute the functions. */
 const denied=async(tables,fns)=>{
  for(const role of ['anon','authenticated']){
   await db.exec(`reset role;set role ${role}`);
   for(const t of tables)await assert.rejects(()=>db.query(`select * from public.${t} limit 1`),code('42501'),`${role} reads ${t}`);
   for(const f of fns)await assert.rejects(()=>db.query(`select public.${f}`),code('42501'),`${role} runs ${f}`);
  }
  await db.exec('reset role;set role service_role');
  const rls=(await q(`select relname,relrowsecurity from pg_class where relname=any($1)`,[tables])).filter(r=>!r.relrowsecurity);assert.deepEqual(rls,[],'RLS on');
  const del=(await q(`select table_name from information_schema.role_table_grants where grantee='service_role' and privilege_type in('DELETE','TRUNCATE') and table_name=any($1)`,[tables]));assert.deepEqual(del,[],'no DELETE/TRUNCATE grant');
 };
 return {db,q,call,call3,mutate,mk,claim,team,denied,staff};
}
