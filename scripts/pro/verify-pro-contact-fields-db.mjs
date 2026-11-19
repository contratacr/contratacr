// LOCAL PRO ONLY (Ronda F2-B, 2026-11-19): disposable in-memory PGlite verification of contact-fields-local.sql (row 05).
// Installs the whole ordered local manifest (same foundation as verify-pro-cost-codes-db.mjs), then checks company
// custom-field definitions (CAS, receipts, validation, capacity, archive/restore/reorder, guarded kind/option changes),
// values per customer by kind, additional phones/e-mails, the import preview (duplicates by additional channel,
// invalid extras) and the atomic idempotent import through the existing pro_contacts_mutate, the export companion,
// immutability, RLS/grants, cascade and an idempotent reapply. No Supabase, network or shared database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {localSqlManifest,localSqlDependencies} from './local-sql-manifest.mjs';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
// The API routes parse every read with the strict schemas of src/lib/pro/cost-codes.ts: check the SQL against them here.
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(libRoot)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(libRoot)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const schemas=await import('../../src/lib/pro/contact-fields.ts');const round10=await import('../../src/lib/pro/round10.ts');
const root=new URL('../../',import.meta.url),db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',rival='00000000-0000-4000-8000-000000000002',customer='00000000-0000-4000-8000-000000000003',stranger='00000000-0000-4000-8000-000000000004';
const code=c=>e=>{assert.equal(e.code,c,`${c} expected, got ${e.code}: ${e.message}`);return true;};
const foundation=await readFile(new URL('scripts/pro/verify-direct-project-quotes-db.mjs',root),'utf8');
const begin=foundation.indexOf('await db.exec(`')+'await db.exec(`'.length,end=foundation.indexOf('`);',begin);
assert.ok(begin>14&&end>begin);const ddl=foundation.slice(begin,end);assert.ok(!ddl.includes('${'));
let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
try{
 await db.exec(ddl);
 await db.exec(`create table auth.users(id uuid primary key);create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
 create function auth.role() returns text language sql as $$select current_user::text$$;
 create table projects(id uuid primary key,client_id uuid,title text,status text,allow_direct_contact boolean);
 create schema cron;create table cron.job(jobname text primary key,schedule text,command text);
 create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint language plpgsql as $$begin insert into cron.job values(p_name,p_schedule,p_command) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);alter table storage.objects enable row level security;
 insert into profiles(id,full_name,role,is_disabled,is_provider) values('${owner}','Dueña Contactos','professional',false,true),('${rival}','Otra Empresa','professional',false,true),('${customer}','Cliente Cuenta','client',false,false),('${stranger}','Cuenta Ajena','client',false,false);`);
 const notifications=await readFile(new URL('supabase/migrations/002_sprint2.sql',root),'utf8');
 await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS public.notifications'),notifications.indexOf('-- SAVED PROFESSIONALS')));
 const emptyDoc=clientId=>({version:1,clients:[{id:clientId,name:'Cliente Ana',email:'ana@example.com',phone:'8888-1111',notes:'',archived:false},{id:clientId+'-2',name:'Cliente Beto',email:'',phone:'',notes:'',archived:false}],products:[],movements:[],work:[],availability:[],quotes:[],quoteLinks:[],social:[]});
 let moduleSql='';
 // The whole manifest is installed; a module that is NOT a declared ancestor of this one may be work in progress of
 // another round: its failure is rolled back and reported, never hidden for an ancestor or for this module.
 const needed=new Set(['contact-fields-local.sql']);for(let grew=true;grew;){grew=false;for(const [from,to] of localSqlDependencies)if(needed.has(to)&&!needed.has(from)){needed.add(from);grew=true;}}
 for(const step of localSqlManifest){
  if(step.ifMissing&&(await db.query('select to_regclass($1) is not null present',[step.ifMissing])).rows[0].present)continue;
  let text=await readFile(new URL('docs/pro/sql/'+step.file,root),'utf8');
  if(step.file==='identity-lookup-maintenance-local.sql')text=text.replace('create extension if not exists pg_cron;','');
  if(step.file==='contact-fields-local.sql')moduleSql=text;
  try{await db.exec(text);}catch(error){if(needed.has(step.file))throw new Error('Manifest SQL failed: '+step.file,{cause:error});await db.exec('rollback');console.log('SKIP unrelated module that does not install here: '+step.file);}
  if(step.file==='memberships-draft.sql')for(const id of [owner,rival])await db.query('select pro_save_workspace($1,$2,0)',[id,emptyDoc('c1')]);
 }
 assert.ok(moduleSql,'contact-fields-local.sql must be in the manifest');
 for(const [id,profile] of [[owner,'30000000-0000-4000-8000-000000000001'],[rival,'30000000-0000-4000-8000-000000000002']]){
  await db.query('insert into professionals(id,profile_id,business_name,slug,is_banned) values($1,$2,$3,$4,false)',[profile,id,'Empresa '+id.slice(-1),'contacts-'+id.slice(-1)]);
  await db.query("insert into pro_memberships(user_id,status) values($1,'active')",[id]);
 }

 const one=async(sql,args)=>(await db.query(sql,args)).rows[0];
 const fields=async(actor=owner)=>{const v=(await one('select pro_contact_fields_read($1) v',[actor])).v;schemas.contactFieldsReadSchema.parse(v);return v;};
 const extrasRead=async(client='c1',actor=owner)=>{const v=(await one('select pro_contact_extras_read($1,$2) v',[actor,client])).v;schemas.contactExtrasReadSchema.parse(v);return v;};
 const write=async(input,actor=owner)=>{const v=(await one('select pro_contact_fields_mutate($1,$2) v',[actor,input])).v;schemas.contactFieldsResultSchema.parse(v);return v;};
 const hint=h=>e=>{assert.equal(e.code,'22023',e.message);assert.equal(e.hint,h);return true;};
 const id=()=>crypto.randomUUID();

 // ---- Definitions ----
 assert.deepEqual(await fields(),{revision:0,capacity:30,fields:[]});
 const fType=id(),fArea=id(),fDate=id(),fNote=id();
 const save={action:'field_save',actionId:id(),revision:0,id:fType,label:'Tipo de propiedad',kind:'select',options:['Casa','Apartamento','Local']};
 const r1=await write(save);assert.equal(r1.revision,1);assert.deepEqual(r1.fields.map(f=>[f.label,f.kind,f.options.length,f.position]),[['Tipo de propiedad','select',3,0]]);
 assert.equal((await write(save)).replayed,true,'idempotent receipt');
 await assert.rejects(()=>write({...save,label:'Otro'}),code('22023'),'action id reused');
 await assert.rejects(()=>write({...save,actionId:id()}),code('40001'),'stale revision');
 await write({action:'field_save',actionId:id(),revision:1,id:fArea,label:'Área (m²)',kind:'number',options:[]});
 await write({action:'field_save',actionId:id(),revision:2,id:fDate,label:'Aniversario',kind:'date',options:[]});
 await write({action:'field_save',actionId:id(),revision:3,id:fNote,label:'Cómo nos conoció',kind:'text',options:[]});
 for(const bad of [{label:''},{label:'x'.repeat(61)},{label:'a\u0001'},{kind:'select',options:[]},{kind:'text',options:['A']},{kind:'select',options:['A','a']},{kind:'select',options:Array.from({length:21},(_,i)=>'o'+i)},{kind:'color'},{extra:1}])
  await assert.rejects(()=>write({action:'field_save',actionId:id(),revision:4,id:id(),label:'Nuevo',kind:'text',options:[],...bad}),code('22023'),JSON.stringify(bad));
 await assert.rejects(()=>write({action:'field_save',actionId:id(),revision:4,id:id(),label:'tipo de PROPIEDAD',kind:'text',options:[]}),code('23505'),'repeated label');
 assert.deepEqual((await fields(rival)).fields,[],'owner isolation');
 pass('definitions: create per kind, CAS, receipts, validation, repeated label, isolation');

 // ---- Values and channels ----
 let ex=await extrasRead();assert.deepEqual([ex.revision,ex.values,ex.channels,ex.history],[0,[],[],[]]);
 const ok={action:'extras_save',actionId:id(),revision:0,clientId:'c1',values:{[fType]:'Casa',[fArea]:'120,5',[fDate]:'2024-02-29',[fNote]:'Recomendación'},channels:[{kind:'phone',value:'+506 7000-2222',label:'Trabajo'},{kind:'email',value:'Ana.Trabajo@Example.com',label:''}]};
 const s1=await write(ok);assert.equal(s1.revision,1);
 assert.deepEqual(Object.fromEntries(s1.values.map(v=>[v.fieldId,v.value])),{[fType]:'Casa',[fArea]:'120.5',[fDate]:'2024-02-29',[fNote]:'Recomendación'},'canonical values');
 assert.deepEqual(s1.channels.map(c=>[c.kind,c.value,c.label]),[['phone','+506 7000-2222','Trabajo'],['email','Ana.Trabajo@Example.com','']]);
 assert.equal((await write(ok)).replayed,true);
 await assert.rejects(()=>write({...ok,actionId:id()}),code('40001'),'stale customer revision');
 const base={action:'extras_save',revision:1,clientId:'c1',channels:[]};
 for(const [vals,label] of [[{[fType]:'Bodega'},'select option'],[{[fArea]:'12a'},'number'],[{[fDate]:'2023-02-29'},'date'],[{[fDate]:'1800-01-01'},'date range'],[{[fNote]:'x'.repeat(501)},'text length']])
  await assert.rejects(()=>write({...base,actionId:id(),values:vals}),e=>{assert.equal(e.code,'22023',label);assert.match(e.hint,/^pro_contact_field_value:/);return true;},label);
 await assert.rejects(()=>write({...base,actionId:id(),values:{},channels:[{kind:'phone',value:'8888 1111',label:''}]}),hint('pro_contact_channel_repeated'),'same as primary phone');
 await assert.rejects(()=>write({...base,actionId:id(),values:{},channels:[{kind:'email',value:'x@y.co',label:''},{kind:'email',value:'X@Y.CO',label:'Otro'}]}),hint('pro_contact_channel_repeated'));
 await assert.rejects(()=>write({...base,actionId:id(),values:{},channels:[{kind:'phone',value:'12',label:''}]}),hint('pro_contact_channel_invalid'));
 await assert.rejects(()=>write({...base,actionId:id(),values:{},channels:[{kind:'fax',value:'88881111',label:''}]}),code('22023'));
 await assert.rejects(()=>write({...base,actionId:id(),values:{},channels:Array.from({length:11},(_,i)=>({kind:'email',value:`a${i}@b.co`,label:''}))}),code('22023'),'max 10 channels');
 await assert.rejects(()=>write({...base,actionId:id(),clientId:'nope',values:{}}),code('P0002'));
 assert.deepEqual((await extrasRead('c1',rival)).values,[],'the other company has its own customer c1, without these values');
 await assert.rejects(()=>write({...base,actionId:id(),revision:0,values:{[fType]:'Casa'}},rival),code('40001'),'other company cannot use these fields');
 assert.equal((await extrasRead('c1',rival)).revision,0);
 ex=await extrasRead();assert.equal(ex.history.length,1);assert.equal(ex.history[0].action,'extras_save');assert.equal(ex.history[0].actorName.length>0,true);
 pass('values validated by kind (canonical number/date, select option), channels normalized/repeated/invalid, CAS, receipts, history');

 // ---- Definition changes guarded by data; archive keeps values ----
 let rev=(await fields()).revision;
 await assert.rejects(()=>write({action:'field_save',actionId:id(),revision:rev,id:fArea,label:'Área',kind:'text',options:[]}),hint('pro_contact_field_kind_in_use'));
 await assert.rejects(()=>write({action:'field_save',actionId:id(),revision:rev,id:fType,label:'Tipo de propiedad',kind:'select',options:['Apartamento','Local']}),hint('pro_contact_field_option_in_use'));
 const renamed=await write({action:'field_save',actionId:id(),revision:rev,id:fType,label:'Tipo de inmueble',kind:'select',options:['Casa','Apartamento','Local','Finca']});rev=renamed.revision;
 assert.equal(renamed.fields.find(f=>f.id===fType).usage,1);
 const arch=await write({action:'field_archive',actionId:id(),revision:rev,id:fNote});rev=arch.revision;assert.equal(arch.fields.find(f=>f.id===fNote).archived,true);
 await assert.rejects(()=>write({action:'field_archive',actionId:id(),revision:rev,id:fNote}),code('40001'),'already archived');
 await assert.rejects(()=>write({...base,revision:1,actionId:id(),values:{[fNote]:'x'}}),code('40001'),'archived field cannot be written');
 const s2=await write({...base,revision:1,actionId:id(),values:{[fType]:'Finca',[fArea]:null},channels:ok.channels});assert.equal(s2.channels.length,2);
 assert.deepEqual(Object.fromEntries(s2.values.map(v=>[v.fieldId,v.value])),{[fType]:'Finca',[fDate]:'2024-02-29',[fNote]:'Recomendación'},'null clears one value; omitted fields and archived fields keep theirs');
 const re=await write({action:'field_reorder',actionId:id(),revision:rev,ids:[fDate,fType,fArea]});rev=re.revision;
 assert.deepEqual(re.fields.filter(f=>!f.archived).map(f=>f.id),[fDate,fType,fArea]);
 await assert.rejects(()=>write({action:'field_reorder',actionId:id(),revision:rev,ids:[fDate,fType]}),code('40001'),'order must list every active field');
 const rs=await write({action:'field_restore',actionId:id(),revision:rev,id:fNote});rev=rs.revision;assert.equal(rs.fields.find(f=>f.id===fNote).archived,false);
 // capacity: 30 active
 for(let i=0;i<26;i++)rev=(await write({action:'field_save',actionId:id(),revision:rev,id:id(),label:'Campo '+i,kind:'text',options:[]})).revision;
 await assert.rejects(()=>write({action:'field_save',actionId:id(),revision:rev,id:id(),label:'Campo 31',kind:'text',options:[]}),hint('pro_contact_field_capacity'));
 pass('kind/option changes guarded by data, rename, archive keeps values, reorder, restore, capacity 30');

 // ---- Import preview and atomic import with extras ----
 const wsRev=async()=>(await one('select revision v from pro_workspace_core where user_id=$1',[owner])).v;
 const rows=[{name:'Carla Nueva',email:'carla@example.com',phone:'7111-0000'},{name:'Duplicada por canal',email:'ana.trabajo@example.com'},{name:'Valor malo',email:'malo@example.com'},{name:'Ana repetida',email:'ANA@example.com'},{name:'Sin extras',phone:'7222 0000'}];
 const extrasIn=[{fields:{[fType]:'Casa',[fArea]:'85'},phones:['6000-1234'],emails:['carla.oficina@example.com']},{fields:{},phones:[],emails:[]},{fields:{[fDate]:'31/12/2020'},phones:[],emails:[]},{fields:{},phones:[],emails:[]},{fields:{},phones:[],emails:[]}];
 const pv=(await one('select pro_contact_extras_preview($1,$2,$3) v',[owner,JSON.stringify(rows),JSON.stringify(extrasIn)])).v;round10.contactPreviewSchema.parse(pv);
 assert.deepEqual(pv.rows.map(r=>r.status),['new','duplicate','invalid','duplicate','new']);
 assert.deepEqual(pv.rows[1].match,{id:'c1',name:'Cliente Ana',by:'email'},'duplicate by an additional e-mail');
 assert.ok(pv.rows[2].issues.some(i=>i.startsWith('custom_invalid:')));
 assert.deepEqual(pv.counts,{total:5,new:2,duplicate:2,duplicateInFile:0,invalid:1});
 await assert.rejects(()=>one('select pro_contact_extras_preview($1,$2,$3) v',[owner,JSON.stringify(rows),JSON.stringify(extrasIn.slice(1))]),code('22023'),'extras aligned with rows');
 const before=await wsRev();
 const imp={action:'import',actionId:id(),revision:before,fileName:'clientes.csv',format:'csv',rows,extras:extrasIn};
 await assert.rejects(()=>one('select pro_contact_extras_import($1,$2) v',[owner,{...imp,revision:before-1}]),code('40001'),'stale workspace');
 assert.equal((await one("select count(*)::int n from pro_clients where user_id=$1",[owner])).n,2,'nothing created after a failure');
 const done=(await one('select pro_contact_extras_import($1,$2) v',[owner,imp])).v;
 assert.equal(done.created,2);assert.equal(done.withExtras,1);
 const names=(await db.query("select id,name from pro_clients where user_id=$1 order by name",[owner])).rows;
 assert.deepEqual(names.map(r=>r.name),['Carla Nueva','Cliente Ana','Cliente Beto','Sin extras'],'the channel duplicate and the invalid row were not created');
 const carla=names.find(r=>r.name==='Carla Nueva').id;assert.ok(done.createdIds.includes(carla));
 const cx=await extrasRead(carla);assert.deepEqual(Object.fromEntries(cx.values.map(v=>[v.fieldId,v.value])),{[fType]:'Casa',[fArea]:'85'});
 assert.deepEqual(cx.channels.map(c=>[c.kind,c.value]),[['phone','6000-1234'],['email','carla.oficina@example.com']]);assert.equal(cx.history[0].action,'import');
 const again=(await one('select pro_contact_extras_import($1,$2) v',[owner,imp])).v;assert.equal(again.replayed,true);assert.equal(again.created,2);
 assert.equal((await one("select count(*)::int n from pro_clients where user_id=$1",[owner])).n,4,'replay never duplicates');
 await assert.rejects(()=>one('select pro_contact_extras_import($1,$2) v',[owner,{...imp,fileName:'otro.csv'}]),code('22023'),'action id reused');
 // A row that fails extras of an archived field at import time: definitions changed → 40001, nothing written
 const arch2=await write({action:'field_archive',actionId:id(),revision:(await fields()).revision,id:fArea});
 const wsNow=await wsRev();await assert.rejects(()=>one('select pro_contact_extras_import($1,$2) v',[owner,{...imp,actionId:id(),revision:wsNow,rows:[{name:'Eva',email:'eva@example.com'}],extras:[{fields:{[fArea]:'3'},phones:[],emails:[]}]}]),code('40001'));
 assert.equal((await one("select count(*)::int n from pro_clients where user_id=$1 and name='Eva'",[owner])).n,0);
 await write({action:'field_restore',actionId:id(),revision:arch2.revision,id:fArea});
 pass('preview flags duplicates by additional channel and invalid extras; atomic, idempotent import with custom fields and channels');

 // ---- Export ----
 const exp=(await one('select pro_contact_extras_export($1) v',[owner])).v;schemas.contactExtrasExportSchema.parse(exp);
 assert.equal(exp.fields.length,30);assert.deepEqual(Object.keys(exp.items).sort(),[carla,'c1'].sort());
 pass('export companion: active fields and extras per customer');

 // ---- Security and integrity ----
 await assert.rejects(()=>fields(customer),code('42501'));await assert.rejects(()=>write({...save,actionId:id()},customer),code('42501'));
 await db.query("update pro_memberships set expires_at=now()-interval '1 day' where user_id=$1",[owner]);await assert.rejects(()=>fields(),code('42501'));
 await db.query('update pro_memberships set expires_at=null where user_id=$1',[owner]);
 await assert.rejects(()=>db.query("update pro_contact_field_actions set result='{}' where owner_id=$1",[owner]),code('55000'));
 await assert.rejects(()=>db.query("delete from pro_contact_field_history where owner_id=$1",[owner]),code('55000'));
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 for(const t of ['pro_contact_field_defs','pro_contact_field_values','pro_contact_channels','pro_contact_field_history','pro_contact_field_actions','pro_contact_extra_heads','pro_contact_field_heads'])await assert.rejects(()=>db.query(`select * from ${t}`),code('42501'),t);
 await assert.rejects(()=>fields(),code('42501'));
 await db.exec('reset role');
 for(const fn of ['pro_contact_fields_read(uuid)','pro_contact_extras_read(uuid,text)','pro_contact_extras_export(uuid)','pro_contact_fields_mutate(uuid,jsonb,uuid)','pro_contact_extras_preview(uuid,jsonb,jsonb)','pro_contact_extras_import(uuid,jsonb,uuid)'])
  for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await one('select has_function_privilege($1,$2,$3) v',[role,'public.'+fn,'EXECUTE'])).v,yes,role+' '+fn);
 const snap=JSON.stringify([await fields(),await extrasRead(),await extrasRead(carla)]);await db.exec(moduleSql);assert.equal(JSON.stringify([await fields(),await extrasRead(),await extrasRead(carla)]),snap,'idempotent reapply keeps data');
 // Removing a customer row cascades its extras (history stays, triggers only fire at depth 0).
 await db.query("delete from pro_clients where user_id=$1 and id=$2",[owner,carla]);
 assert.equal((await one('select count(*)::int n from pro_contact_channels where owner_id=$1 and client_id=$2',[owner,carla])).n,0);
 assert.equal((await one('select count(*)::int n from pro_contact_field_history where owner_id=$1 and subject=$2',[owner,carla])).n,1);
 pass('authorization (customer, other owner, expired Pro), immutable receipts/history, RLS/grants service_role only, idempotent reapply, cascade');
 console.log(`${checks} contact-field contract groups passed; in-memory PGlite only.`);
}finally{await db.close();}
