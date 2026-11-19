import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;create table profiles(id uuid primary key,role text,is_disabled boolean);insert into profiles values('${a}','professional',false),('${b}','professional',false);create table professionals(id uuid primary key,profile_id uuid);create table quotes(id uuid primary key,professional_id uuid,client_id uuid,title text,client_name text,total numeric,status text,created_at timestamptz,deleted_at timestamptz);`);
await db.exec(await readFile('docs/pro/sql/memberships-draft.sql','utf8'));
const client={id:'c',name:'Original',email:'',phone:'',notes:'Conservar',archived:false};
const quote={id:'old-q',clientId:'c',title:'Original',lines:[{description:'Servicio',quantity:1,price:1.005,tax:0},{description:'Orden conservado',quantity:2,price:0,tax:13}],status:'draft',validUntil:'2026-12-01'};
const slot={start:'2026-11-15T09:00:00-06:00',end:'2026-11-15T10:00:00-06:00'};
const original={version:1,clients:[client],products:[{id:'p',sku:'SKU',name:'Material',stock:5,minimum:1,cost:1,price:2,archived:false}],movements:[],work:[],availability:[slot,{start:'2026-12-01T09:00:00-06:00',end:'2026-12-01T10:00:00-06:00'}],quotes:[quote],quoteLinks:[],social:[]};
for(let i=0;i<42;i++)original.work.push({id:'w-'+String(i).padStart(3,'0'),client:'Original',clientId:'c',service:'Servicio',stage:'completed',start:'2026-11-15T12:00:00-06:00',end:'2026-11-15T13:00:00-06:00',cancelled:false});
await db.query('select pro_save_workspace($1,$2,0)',[a,original]);
const sparseOwner='00000000-0000-4000-8000-000000000003',sparse={version:1,social:[],clients:[],products:[],movements:[]};
await db.query('insert into profiles values($1,\'professional\',false)',[sparseOwner]);
await db.query('select pro_save_workspace($1,$2,0)',[sparseOwner,sparse]);

// This runner has no URL, socket, connection-string or hosted database option.
const manifest=JSON.parse(await readFile('docs/pro/migration-candidate-v1.json','utf8'));
assert.equal(manifest.status,'isolated-rehearsal-only');
const steps=await Promise.all(manifest.steps.map(async step=>{assert.match(step.path,/^docs\/pro\/sql\/[a-z-]+\.sql$/);const sql=await readFile(step.path,'utf8');assert.equal(createHash('sha256').update(sql).digest('hex'),step.sha256,'Candidate input changed: '+step.path);return sql;}));
const legacy=(await db.query('select user_id,document,revision,updated_at from pro_workspaces order by user_id')).rows;
try{
 for(const sql of steps)await db.exec(sql);
 const upgraded=(await db.query('select user_id,document,revision,updated_at from pro_workspaces order by user_id')).rows;
 assert.deepEqual(upgraded,legacy,'Every legacy document, revision and timestamp must survive');
 assert.deepEqual((await db.query('select document from pro_workspace_legacy_backup where user_id=$1',[a])).rows[0].document,original);
 assert.deepEqual((await db.query('select document from pro_panel_legacy_backup where user_id=$1',[a])).rows[0].document,original);
 assert.equal((await db.query('select count(*)::int n from pro_work where user_id=$1',[a])).rows[0].n,42);
 assert.equal((await db.query('select count(*)::int n from pro_legacy_quote_lines where user_id=$1',[a])).rows[0].n,2);
 assert.equal((await db.query("select document ?| array['clients','products','movements','work','quotes','quoteLinks','availability'] as unnormalized from pro_workspace_core where user_id=$1",[a])).rows[0].unnormalized,false);
 // Reapplying the one-time rename must fail atomically, leaving the upgraded data intact.
 await assert.rejects(()=>db.exec(steps[0]));await db.exec('rollback');
 assert.deepEqual((await db.query('select user_id,document,revision,updated_at from pro_workspaces order by user_id')).rows,legacy);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${sparseOwner}';`);
 assert.equal((await db.query('select * from pro_clients')).rows.length,0);
 assert.equal((await db.query('select * from pro_work')).rows.length,0);
 await assert.rejects(()=>db.query('select * from pro_workspace_legacy_backup'),error=>error.code==='42501');
 await assert.rejects(()=>db.query('select * from pro_panel_legacy_backup'),error=>error.code==='42501');
 await assert.rejects(()=>db.query("update pro_work set service='forged'"));
 await db.exec('reset role');
 console.log('PASS: pinned candidate; populated and sparse legacy documents/revisions/timestamps identical; both backups intact; normalized rows; repeated one-time step refused without damage; owner isolation and denied writes. In-memory PostgreSQL only.');
}finally{await db.close();}
