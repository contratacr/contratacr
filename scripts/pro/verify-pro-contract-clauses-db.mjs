// LOCAL PRO ONLY (Ronda F2-B, 2026-11-19): disposable in-memory PGlite verification of rows 40 and 35.
// Installs the whole ordered local manifest (same foundation stubs as verify-pro-cost-codes-db.mjs), then checks
// - contracts-local.sql: library clause versions read from the immutable history (create/update, older clause without
//   a create entry, archive does not add a version), restore as a normal CAS edit (409 on a stale revision, idempotent
//   receipt), owner isolation, and the new merge fields {{cliente.telefono}}, {{cliente.correo}}, {{trabajo.direccion}},
//   {{monto.total}} (resolved in the preview and frozen in the shared version, old tokens unchanged);
// - lead-quick-quote-local.sql: the "Cotizar" context of manual opportunities and ContrataCR requests (customer, source,
//   blocked reasons) and the catalogue match (exact, contains, words, services first, archived ignored, no invented price).
// Every read is parsed with the strict API schemas. No Supabase, network or shared database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {localSqlManifest,localSqlDependencies} from './local-sql-manifest.mjs';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(libRoot)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(libRoot)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const contracts=await import('../../src/lib/pro/contracts.ts');
const quick=await import('../../src/lib/pro/lead-quick-quote.ts');
const root=new URL('../../',import.meta.url),db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',rival='00000000-0000-4000-8000-000000000002',customer='00000000-0000-4000-8000-000000000003',stranger='00000000-0000-4000-8000-000000000004';
const code=c=>e=>{assert.equal(e.code,c,`${c} expected, got ${e.code}: ${e.message}`);return true;};
const foundation=await readFile(new URL('scripts/pro/verify-direct-project-quotes-db.mjs',root),'utf8');
const begin=foundation.indexOf('await db.exec(`')+'await db.exec(`'.length,end=foundation.indexOf('`);',begin);
assert.ok(begin>14&&end>begin);const ddl=foundation.slice(begin,end);assert.ok(!ddl.includes('${'));
let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
const uuid=()=>crypto.randomUUID();
try{
 await db.exec(ddl);
 await db.exec(`create table auth.users(id uuid primary key);create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
 create function auth.role() returns text language sql as $$select current_user::text$$;
 create table projects(id uuid primary key,client_id uuid,title text,status text,allow_direct_contact boolean);
 create schema cron;create table cron.job(jobname text primary key,schedule text,command text);
 create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint language plpgsql as $$begin insert into cron.job values(p_name,p_schedule,p_command) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);alter table storage.objects enable row level security;
 insert into profiles(id,full_name,role,is_disabled,is_provider) values('${owner}','Dueña Contratos','professional',false,true),('${rival}','Otra Empresa','professional',false,true),('${customer}','Cliente Cuenta','client',false,false),('${stranger}','Cuenta Ajena','client',false,false);`);
 const notifications=await readFile(new URL('supabase/migrations/002_sprint2.sql',root),'utf8');
 await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS public.notifications'),notifications.indexOf('-- SAVED PROFESSIONALS')));
 const linked='reservation-'+customer;
 const doc=(clients,products)=>({version:1,clients,products,movements:[],work:[],availability:[],quotes:[],quoteLinks:[],social:[]});
 const product=(id,name,price,extra={})=>({id,sku:id.toUpperCase(),name,stock:0,minimum:0,cost:0,price,archived:false,unit:'servicio',itemType:'service',...extra});
 const ownerDoc=doc([{id:linked,name:'Cliente Cuenta',email:'cliente@example.com',phone:'8888-1234',notes:'',archived:false,address:'San Pedro, Montes de Oca'},
   {id:'manual-client',name:'Cliente Manual',email:'',phone:'',notes:'',archived:false},{id:'archived-client',name:'Cliente Archivado',email:'',phone:'',notes:'',archived:true}],
  [product('p-kitchen','Remodelación de cocinas',1250000.5),product('p-kitchen-goods','Remodelación de cocina',99,{itemType:'product',unit:'unidad'}),product('p-paint','Pintura interior y exterior',350000),
   product('p-roof','Reparación de techos',420000),product('p-old','Limpieza de canoas',50000,{archived:true})]);
 const needed=new Set(['contracts-local.sql','lead-quick-quote-local.sql']);for(let grew=true;grew;){grew=false;for(const [from,to] of localSqlDependencies)if(needed.has(to)&&!needed.has(from)){needed.add(from);grew=true;}}
 let installed=0;
 for(const step of localSqlManifest){
  if(step.ifMissing&&(await db.query('select to_regclass($1) is not null present',[step.ifMissing])).rows[0].present)continue;
  let text=await readFile(new URL('docs/pro/sql/'+step.file,root),'utf8');
  if(step.file==='identity-lookup-maintenance-local.sql')text=text.replace('create extension if not exists pg_cron;','');
  if(needed.has(step.file)&&['contracts-local.sql','lead-quick-quote-local.sql'].includes(step.file))installed++;
  try{await db.exec(text);}catch(error){if(needed.has(step.file))throw new Error('Manifest SQL failed: '+step.file,{cause:error});await db.exec('rollback');console.log('SKIP unrelated module that does not install here: '+step.file);}
  if(step.file==='memberships-draft.sql'){await db.query('select pro_save_workspace($1,$2,0)',[owner,ownerDoc]);await db.query('select pro_save_workspace($1,$2,0)',[rival,doc([],[product('r-kitchen','Remodelación de cocina',1)])]);}
 }
 assert.equal(installed,2,'both modules are in the manifest');
 for(const [id,profile] of [[owner,'30000000-0000-4000-8000-000000000001'],[rival,'30000000-0000-4000-8000-000000000002']]){
  await db.query('insert into professionals(id,profile_id,business_name,slug,is_banned) values($1,$2,$3,$4,false)',[profile,id,'Empresa '+id.slice(-1),'ctr-'+id.slice(-1)]);
  await db.query("insert into pro_memberships(user_id,status) values($1,'active')",[id]);
 }
 const one=async(sql,args)=>(await db.query(sql,args)).rows[0];
 const mutate=async(input,actor=owner)=>(await one('select pro_contracts_mutate($1,$2) v',[actor,input])).v;
 const library=async(actor=owner)=>contracts.contractLibrarySchema.parse((await one('select pro_contract_library_read($1,false) v',[actor])).v);
 const versions=async(clause,actor=owner)=>contracts.libraryClauseVersionsSchema.parse((await one('select pro_contract_library_clause_versions($1,$2) v',[actor,clause])).v);

 // ---- Row 40: library clause versions ----
 const clause=uuid();
 const created=await mutate({action:'library_clause_create',actionId:uuid(),id:clause,title:'Garantía',body:'Garantía de 6 meses para {{cliente.nombre}}.'});
 contracts.libraryClauseResultSchema.parse(created);assert.equal(created.clause.version,undefined,'write results keep their shape');
 assert.equal((await library()).clauses.find(c=>c.id===clause).version,1);
 let v=await versions(clause);assert.deepEqual(v.versions.map(x=>[x.version,x.current]),[[1,true]]);
 const edit1={action:'library_clause_update',actionId:uuid(),id:clause,revision:1,title:'Garantía',body:'Garantía de 12 meses para {{cliente.nombre}}.'};
 await mutate(edit1);
 assert.deepEqual((await mutate(edit1)).clause.revision,2,'idempotent receipt');
 await mutate({action:'library_clause_archive',actionId:uuid(),id:clause,revision:2});await mutate({action:'library_clause_restore',actionId:uuid(),id:clause,revision:3});
 await mutate({action:'library_clause_update',actionId:uuid(),id:clause,revision:4,title:'Garantía de obra',body:'Garantía de 24 meses en {{trabajo.direccion}}.'});
 v=await versions(clause);
 assert.deepEqual(v.versions.map(x=>[x.version,x.title,x.current]),[[3,'Garantía de obra',true],[2,'Garantía',false],[1,'Garantía',false]],'archive/restore add no version; newest first');
 assert.equal(v.versions[2].body,'Garantía de 6 meses para {{cliente.nombre}}.');assert.equal(v.clause.revision,5);
 assert.equal((await library()).clauses.find(c=>c.id===clause).version,3);
 pass('library clause versions from the immutable history (create, updates; archive/restore do not add versions)');

 // Restore = a normal library_clause_update with CAS; it becomes a NEW version and keeps the previous ones.
 const old=v.versions[2];
 await assert.rejects(()=>mutate({action:'library_clause_update',actionId:uuid(),id:clause,revision:4,title:old.title,body:old.body}),code('40001'),'stale revision');
 const restored={action:'library_clause_update',actionId:uuid(),id:clause,revision:5,title:old.title,body:old.body};
 await mutate(restored);await mutate(restored);
 v=await versions(clause);assert.deepEqual(v.versions.map(x=>x.version),[4,3,2,1]);assert.equal(v.versions[0].body,old.body);assert.equal(v.versions[0].current,true);
 await assert.rejects(()=>mutate({...restored,actionId:uuid(),revision:6}),code('22023'),'no-op edit is rejected by the existing writer');
 pass('restore through the existing writer: CAS 40001, idempotent receipt, new version, history kept');

 // Older data: a clause without a create entry (inserted directly) and one edited afterwards.
 const legacy=uuid();
 await db.query("insert into pro_contract_library_clauses(owner_id,id,title,body) values($1,$2,'Pagos','Texto original.')",[owner,legacy]);
 assert.deepEqual((await versions(legacy)).versions.map(x=>[x.version,x.body]),[[1,'Texto original.']]);
 await mutate({action:'library_clause_update',actionId:uuid(),id:legacy,revision:1,title:'Pagos',body:'Texto nuevo.'});
 assert.deepEqual((await versions(legacy)).versions.map(x=>[x.version,x.body,x.current]),[[2,'Texto nuevo.',true],[1,'Texto original.',false]]);
 pass('older clause without a create entry: version 1 from the first update "before" text');

 await assert.rejects(()=>versions(clause,rival),code('P0002'),'other account');
 await assert.rejects(()=>versions(uuid()),code('P0002'));
 await assert.rejects(()=>versions(clause,customer),code('42501'),'not Pro');
 await assert.rejects(()=>db.query("update pro_contract_history set after_value='{}' where owner_id=$1",[owner]),e=>/immutable|Immutable|23514|not allowed/i.test(e.message)||e.code==='23514');
 const grants=(await one(`select bool_or(has_function_privilege('anon','public.pro_contract_library_clause_versions(uuid,uuid)','execute')) anon,bool_or(has_function_privilege('authenticated','public.pro_contract_library_clause_states(uuid,uuid)','execute')) auth,bool_and(has_function_privilege('service_role','public.pro_contract_library_clause_versions(uuid,uuid)','execute')) svc`));
 assert.deepEqual([grants.anon,grants.auth,grants.svc],[false,false,true]);
 pass('isolation (P0002 other account, 42501 non-Pro), immutable history, service_role-only grants');

 // ---- Row 40: new merge fields ----
 assert.deepEqual((await library()).fields.slice(-4),['cliente.telefono','cliente.correo','trabajo.direccion','monto.total']);
 const work='ctr-work';
 await db.query('insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled) values($1,$2,$3,$4,$5,$6,$7,$8,false)',[owner,work,'Cliente Cuenta','Remodelación de cocina','scheduled','','',linked]);
 const contract=uuid();
 const c1=await mutate({action:'contract_create',actionId:uuid(),workId:work,id:contract,templateId:null,title:'Contrato de obra',language:'es',estimateId:null,depositPercent:30});
 await mutate({action:'clause_put',actionId:uuid(),scope:'contract',id:contract,revision:c1.contract.revision,clauseId:uuid(),position:1,title:'Partes',
  body:'{{cliente.nombre}} ({{cliente.telefono}}, {{cliente.correo}}) en {{trabajo.direccion}} / {{proyecto.direccion}} por {{monto.total}}.'});
 await assert.rejects(()=>mutate({action:'clause_put',actionId:uuid(),scope:'contract',id:contract,revision:c1.contract.revision+1,clauseId:uuid(),position:2,title:'X',body:'{{monto.otro}}'}),code('22023'),'unknown token still rejected');
 let detail=contracts.contractDetailSchema.parse((await one('select pro_contract_read($1,$2,$3) v',[owner,work,contract])).v);
 assert.equal(detail.preview.fields['cliente.telefono'],'8888-1234');assert.equal(detail.preview.fields['cliente.correo'],'cliente@example.com');
 assert.equal(detail.preview.fields['trabajo.direccion'],'San Pedro, Montes de Oca');assert.equal(detail.preview.fields['trabajo.direccion'],detail.preview.fields['proyecto.direccion']);
 assert.equal(detail.preview.fields['monto.total'],null,'no quote linked: no invented amount');assert.deepEqual(detail.preview.missingFields,['monto.total']);
 assert.match(detail.preview.clauses[0].body,/^Cliente Cuenta \(8888-1234, cliente@example\.com\) en San Pedro, Montes de Oca \/ San Pedro, Montes de Oca por \{\{monto\.total\}\}\.$/);
 pass('new merge fields resolve from the customer and job address; missing amount is reported, unknown tokens rejected');

 // ---- Row 35: "Cotizar" context and catalogue match ----
 const ctx=async(kind,id,actor=owner)=>quick.leadQuickQuoteContextSchema.parse((await one('select pro_lead_quick_quote_context($1,$2,$3) v',[actor,kind,id])).v);
 const match=async(service,actor=owner)=>{const r=(await one('select pro_lead_quick_quote_match($1,$2) v',[actor,service])).v;return r&&quick.leadQuickQuoteMatchSchema.parse(r);};
 assert.deepEqual(await match('Remodelación de cocinas'),{productId:'p-kitchen',name:'Remodelación de cocinas',unit:'servicio',priceCents:125000050,itemType:'service',matchedBy:'exact',score:100});
 assert.equal((await match('REMODELACION DE COCINA')).productId,'p-kitchen-goods','exact normalized name wins over a service');
 assert.deepEqual([(await match('Pintura')).productId,(await match('Pintura')).matchedBy],['p-paint','contains']);
 assert.deepEqual([(await match('Reparación urgente de techos')).productId,(await match('Reparación urgente de techos')).matchedBy],['p-roof','words']);
 assert.equal(await match('Limpieza de canoas'),null,'archived items are ignored');
 assert.equal(await match('Fontanería'),null,'no close item: no line, no invented price');
 assert.equal(await match(''),null);
 assert.equal((await match('Remodelación de cocina',rival)).productId,'r-kitchen','own catalogue only');
 pass('catalogue match: exact (accent/case-insensitive), contains, words, archived ignored, none, own catalogue only');

 const manual=uuid(),manualArchived=uuid(),manualNoClient=uuid();
 for(const [id,client,title,type,archived] of [[manual,'manual-client','Cocina nueva','Remodelación de cocinas',false],[manualArchived,'manual-client','Pintar casa',null,true],[manualNoClient,'archived-client','Techo',null,false]])
  await db.query("insert into pro_lead_center_records(owner_id,kind,id,client_id,title,description,address,source_label,project_type,currency,stage_mode,revision,archived) values($1,'manual',$2,$3,$4,'','','',coalesce($5,''),'CRC','automatic',3,$6)",[owner,id,client,title,type,archived]);
 let x=await ctx('manual',manual);
 assert.deepEqual([x.clientId,x.clientName,x.source,x.blocked,x.match.productId,x.service],['manual-client','Cliente Manual',{kind:'manual',id:manual,revision:3},null,'p-kitchen','Remodelación de cocinas']);
 assert.equal((await ctx('manual',manualArchived)).blocked,'archived');assert.equal((await ctx('manual',manualNoClient)).blocked,'client_archived');
 const request=uuid(),requestWork=uuid();
 await db.query("insert into pro_appointment_requests(id,professional_id,owner_id,client_user_id,client_name,professional_name,service,duration_minutes,location_kind,status) values($1,$2,$3,$4,'Cliente Cuenta','Empresa 1','Pintura',60,'agree','requested')",[request,'30000000-0000-4000-8000-000000000001',owner,customer]);
 x=await ctx('request',request);assert.deepEqual([x.clientId,x.source,x.blocked,x.match.productId],[linked,null,null,'p-paint']);
 await db.query("insert into pro_appointment_requests(id,professional_id,owner_id,client_user_id,client_name,professional_name,service,duration_minutes,location_kind,status,work_id) values($1,$2,$3,$4,'Cliente Cuenta','Empresa 1','Remodelación de cocina',60,'agree','confirmed',$5)",[requestWork,'30000000-0000-4000-8000-000000000001',owner,customer,work]);
 x=await ctx('request',requestWork);assert.deepEqual([x.clientId,x.source,x.match.productId],[linked,{kind:'work',id:work},'p-kitchen-goods']);
 const orphan=uuid();
 await db.query("insert into pro_appointment_requests(id,professional_id,owner_id,client_user_id,client_name,professional_name,service,duration_minutes,location_kind,status) values($1,$2,$3,$4,'Cuenta Ajena','Empresa 1','Fontanería',60,'agree','requested')",[orphan,'30000000-0000-4000-8000-000000000001',owner,stranger]);
 x=await ctx('request',orphan);assert.deepEqual([x.clientId,x.blocked,x.match],[null,'no_client',null],'never creates a customer here');
 await assert.rejects(()=>ctx('request',request,rival),code('P0002'),'other account');
 await assert.rejects(()=>ctx('manual',uuid()),code('P0002'));
 await assert.rejects(()=>one('select pro_lead_quick_quote_context($1,$2,$3) v',[owner,'other',manual]),code('22023'));
 const quickGrants=(await one(`select has_function_privilege('anon','public.pro_lead_quick_quote_context(uuid,text,uuid)','execute') anon,has_function_privilege('authenticated','public.pro_lead_quick_quote_match(uuid,text)','execute') auth`));
 assert.deepEqual([quickGrants.anon,quickGrants.auth],[false,false]);
 pass('quick-quote context: manual/request/work sources, blocked reasons, isolation, read only');

 // Idempotent reapply of both modules.
 for(const file of ['contracts-local.sql','lead-quick-quote-local.sql'])await db.exec(await readFile(new URL('docs/pro/sql/'+file,root),'utf8'));
 assert.deepEqual((await versions(clause)).versions.map(x=>x.version),[4,3,2,1]);
 pass('both modules reapply idempotently and keep the versions');
 console.log(`PASS ${checks} groups`);
}finally{await db.close();}
