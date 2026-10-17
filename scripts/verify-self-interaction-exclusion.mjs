import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1), other=id(2), pro=id(3), otherPro=id(4), project=id(5), job=id(6), offer=id(7), otherProject=id(8);
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table profiles(id uuid primary key);
    create table professionals(id uuid primary key,profile_id uuid);
    create table projects(id uuid primary key,client_id uuid);
    create table job_posts(id uuid primary key,employer_id uuid);
    create table professional_offers(id uuid primary key,professional_id uuid);
    create table interaction_events(id uuid primary key default gen_random_uuid(),event_type text,professional_id uuid,viewer_user_id uuid,metadata jsonb default '{}');`);
  await db.query('insert into profiles values($1),($2)',[owner,other]);
  await db.query('insert into professionals values($1,$2),($3,$4)',[pro,owner,otherPro,other]);
  await db.query('insert into projects values($1,$2),($3,$4)',[project,owner,otherProject,other]);
  await db.query('insert into job_posts values($1,$2)',[job,pro]);
  await db.query('insert into professional_offers values($1,$2)',[offer,pro]);
  const rows=[
    ...['profile_view','whatsapp_click','phone_click','email_click','availability_view','schedule_slot_selected','favorite_add','favorite_remove','profile_share','external_link_click','contact_gate_shown'].map(type=>[type,pro,{}]),
    ['project_view',null,{projectId:project}],
    ['project_lead_whatsapp',otherPro,{project_id:project,channel:'whatsapp'}],
    ['project_lead_phone',otherPro,{project_id:project,channel:'phone'}],
    ['job_view',pro,{jobId:job}],
    ['whatsapp_click',pro,{jobId:job}],
    ['phone_click',null,{job_id:job}],
    ['job_application_sent',null,{job_id:job}],
    ['offer_view',pro,{offerId:offer}],
    ['whatsapp_click',null,{offer_id:offer}],
  ];
  const insert=(actor,[type,target,metadata])=>db.query('insert into interaction_events(event_type,professional_id,viewer_user_id,metadata) values($1,$2,$3,$4)',[type,target,actor,metadata]);
  for (const row of rows) for (const actor of [owner,other,null]) await insert(actor,row);
  // The project lead uses professional_id for the sender. It must remain when
  // they contact another person's project, including historical rows.
  const lead=['project_lead_whatsapp',pro,{project_id:otherProject,channel:'whatsapp'}];
  const creates=['quote_created','project_published','service_request_created','proposal_sent','identity_verified','search_performed'];
  await insert(owner,lead);
  for (const type of creates) await insert(owner,[type,pro,{}]);
  const count=async table=>(await db.query(`select count(*)::int n from ${table}`)).rows[0].n;
  const migration=await readFile(new URL('../supabase/migrations/246_excluir_interacciones_propias.sql',import.meta.url),'utf8');
  await db.exec(migration);
  assert.equal(await count('excluded_self_interactions'),rows.length);
  assert.equal(await count('interaction_events'),rows.length*2+1+creates.length);
  // Migrating twice does not remove or duplicate other people's activity.
  await db.exec(migration);
  assert.equal(await count('excluded_self_interactions'),rows.length);
  const before=await count('interaction_events');
  for (const row of rows) await insert(owner,row);
  assert.equal(await count('interaction_events'),before);
  // All writers, including a server insert without professional_id, are covered.
  for (const row of rows) for (const actor of [other,null]) await insert(actor,row);
  assert.equal(await count('interaction_events'),before+rows.length*2);
  await insert(owner,lead);
  assert.equal(await count('interaction_events'),before+rows.length*2+1);
  // Bad/missing metadata cannot break core writes or erase legitimate demand.
  for (const metadata of [{project_id:'not-a-uuid'},{projectId:'deleted-id'},{jobId:''},{offer_id:'broken'}]) await insert(owner,['whatsapp_click',otherPro,metadata]);
  await insert(owner,['project_lead_whatsapp',pro,{}]);
  const lastCount=await count('interaction_events');
  await db.exec(`update interaction_events set viewer_user_id='${owner}' where event_type='profile_view' and viewer_user_id='${other}'`);
  assert.equal(await count('interaction_events'),lastCount);
  assert.equal((await db.query('select count(*)::int n from interaction_events where event_type=$1 and viewer_user_id=$2',['profile_view',owner])).rows[0].n,0);
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(()=>db.query('select * from excluded_self_interactions'));
    await assert.rejects(()=>db.query('select is_own_marketplace_interaction($1,$2,$3,$4)',[owner,pro,'profile_view',{}]));
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  assert.equal(await count('excluded_self_interactions'),rows.length);
  await db.exec('reset role');
  await db.query('delete from profiles where id=$1',[owner]);
  assert.equal(await count('excluded_self_interactions'),0);
  console.log(`Own-interaction exclusion passed: ${rows.length} own view/contact cases, historical archive, repeat migration, insert/update protection, other users, anonymous activity, legitimate project leads, creation events, malformed IDs and private archive.`);
} finally { await db.close(); }
