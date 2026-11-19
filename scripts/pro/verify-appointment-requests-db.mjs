// Isolated PostgreSQL only: never connects to Supabase or sends notifications.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const {appointmentMutationSchema}=await import('../../src/lib/pro/appointment-requests.ts');
const db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',otherOwner='00000000-0000-4000-8000-000000000002',client='00000000-0000-4000-8000-000000000003',outsider='00000000-0000-4000-8000-000000000004';
const professional='10000000-0000-4000-8000-000000000001',otherProfessional='10000000-0000-4000-8000-000000000002';
const day=new Date(Date.now()+2*86400000).toISOString().slice(0,10),laterDay=new Date(Date.now()+3*86400000).toISOString().slice(0,10),time=(hour,whichDay=day)=>`${whichDay}T${String(hour).padStart(2,'0')}:00:00-06:00`;
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;
create table profiles(id uuid primary key,full_name text,role text,is_disabled boolean,is_provider boolean);
create table professionals(id uuid primary key,profile_id uuid,business_name text,slug text,is_banned boolean);
create table quotes(id uuid primary key,professional_id uuid,client_id uuid,title text,client_name text,total numeric,status text,created_at timestamptz,deleted_at timestamptz);
insert into profiles values('${owner}','Proveedor original','professional',false,true),('${otherOwner}','Otro proveedor','professional',false,true),('${client}','Cliente de cuenta','client',false,false),('${outsider}','Cuenta ajena','client',false,false);
insert into professionals values('${professional}','${owner}','Proveedor original','citas-original',false),('${otherProfessional}','${otherOwner}','Otro proveedor','citas-otro',false);`);
await db.exec(await readFile('docs/pro/sql/memberships-draft.sql','utf8'));await db.exec(await readFile('docs/pro/sql/pro-entitled-draft.sql','utf8'));
const contact={id:'reservation-'+client,name:'Contacto conservado',email:'saved@example.test',phone:'8888-1234',notes:'Nota privada conservada',address:'Dirección original conservada',archived:false};
const legacyWork={id:'legacy-work',clientId:contact.id,client:contact.name,service:'Trabajo anterior conservado',stage:'scheduled',start:time(10),end:time(11),cancelled:false,bookingClientId:client};
const original={version:1,clients:[contact],products:[{id:'material',sku:'MAT',name:'Material conservado',stock:20,minimum:2,cost:15,price:25,archived:false}],movements:[],work:[legacyWork],availability:[{start:time(8),end:time(16)},{start:time(8,laterDay),end:time(16,laterDay)}],quotes:[],quoteLinks:[],social:[]};
for(const actor of [owner,otherOwner]){await db.query('select pro_save_workspace($1,$2,0)',[actor,original]);await db.query("insert into pro_memberships(user_id,status) values($1,'active')",[actor]);}
for(const file of ['catalog-storage-draft.sql','catalog-item-types-local.sql','catalog-mutations-draft.sql','catalog-pages-draft.sql','panel-storage-draft.sql','panel-queries-draft.sql','client-operations-draft.sql'])await db.exec(await readFile('docs/pro/sql/'+file,'utf8'));
await db.query('select pro_record_client_operation($1,$2,1)',[owner,{actionId:crypto.randomUUID(),clientId:contact.id,workId:legacyWork.id,kind:'agreement',amountCents:100000,note:'Acuerdo original'}]);
const coreRevision=async()=>(await db.query('select revision from pro_workspace_core where user_id=$1',[owner])).rows[0].revision;
await db.query('select pro_record_client_operation($1,$2,$3)',[owner,{actionId:crypto.randomUUID(),clientId:contact.id,workId:legacyWork.id,kind:'payment',amountCents:1000,note:'Pago original'},await coreRevision()]);
const privateSnapshot=async()=>{
 const tables=['pro_clients','pro_products','pro_movements','pro_client_entries','pro_workspace_legacy_backup','pro_panel_legacy_backup'];const out={};
 for(const table of tables)out[table]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') result from ${table} t`)).rows[0].result;
 out.core=(await db.query('select user_id,document from pro_workspace_core order by user_id')).rows;
 out.legacyWork=(await db.query('select to_jsonb(w) row from pro_work w where id=$1 order by user_id',[legacyWork.id])).rows;
 return out;
};
const before=await privateSnapshot();
const sql=await readFile('docs/pro/sql/appointment-requests-local.sql','utf8');await db.exec(sql);
const mutate=async(actor,input)=>(await db.query('select pro_appointment_mutate($1,$2) result',[actor,input])).rows[0].result;
const detail=async(actor,id,after=null)=>(await db.query('select pro_appointment_detail($1,$2,$3) result',[actor,id,after])).rows[0].result;
const page=async(actor,side='client',after=null,status=null)=>(await db.query('select pro_appointment_page($1,$2,$3,$4) result',[actor,side,after,status])).rows[0].result;
const slots=async(duration=120,targetDay=day,actor=owner)=>(await db.query('select pro_appointment_slots($1,$2,$3) result',[actor,targetDay,duration])).rows[0].result;
const make=(patch={})=>({action:'create',id:crypto.randomUUID(),actionId:crypto.randomUUID(),professionalId:professional,service:'Revisión de prueba',durationMinutes:120,locationKind:'agree',locationText:'',note:'Nota solo de las partes',start:null,preferredDay:day,preference:'Durante la mañana',...patch});
const change=(action,id,revision,fields={})=>({action,id,revision,actionId:crypto.randomUUID(),...fields});
for(const patch of [{durationMinutes:110},{durationMinutes:0},{durationMinutes:481},{locationKind:'customer',locationText:''},{service:''},{extra:true},{preferredDay:'2030-02-30'},{actor:owner}])assert.equal(appointmentMutationSchema.safeParse(make(patch)).success,false);
assert.equal(appointmentMutationSchema.safeParse(make({durationMinutes:120})).success,true);
const availability=await slots();assert.ok(availability.slots.length>0);for(const slot of availability.slots){assert.deepEqual(Object.keys(slot).sort(),['end','start']);assert.equal(Date.parse(slot.end)-Date.parse(slot.start),120*60000);assert.ok(Date.parse(slot.end)<=Date.parse(time(10))||Date.parse(slot.start)>=Date.parse(time(11)));}
assert.ok(availability.slots.some(slot=>Date.parse(slot.start)===Date.parse(time(14))));await assert.rejects(()=>slots(110));
assert.deepEqual(await privateSnapshot(),before);
const request=make(),created=await mutate(client,request);assert.equal(created.id,request.id);assert.equal(created.status,'requested');assert.equal(created.workId,null);
assert.equal((await db.query('select count(*)::int n from pro_work')).rows[0].n,2);
assert.deepEqual(await mutate(client,request),created);
await assert.rejects(()=>mutate(client,{...request,note:'Changed retry payload'}),error=>error.code==='22023');
assert.equal(await detail(outsider,request.id),null);assert.equal(await detail(otherOwner,request.id),null);assert.equal((await page(outsider)).items.length,0);
await assert.rejects(()=>mutate(client,change('confirm',request.id,created.revision)),error=>error.code==='42501');
const proposal=change('propose',request.id,created.revision,{start:time(8),durationMinutes:120,note:'Horario propuesto'}),proposed=await mutate(owner,proposal);assert.equal(proposed.status,'proposed');
await assert.rejects(()=>mutate(owner,change('propose',request.id,created.revision,{start:time(12),durationMinutes:120,note:''})),error=>error.code==='40001');
const accepted=await mutate(client,change('accept',request.id,proposed.revision));assert.equal(accepted.status,'confirmed');assert.ok(accepted.workId);
const confirmed=await detail(client,request.id);assert.equal(confirmed.request.workId,accepted.workId);assert.equal(confirmed.request.durationMinutes,120);assert.equal(Date.parse(confirmed.request.end)-Date.parse(confirmed.request.start),120*60000);
assert.equal((await page(owner,'provider')).items[0].id,request.id);assert.equal((await page(client)).items[0].id,request.id);
const linkedWork=async(id=accepted.workId)=>(await db.query('select to_jsonb(w) row from pro_work w where user_id=$1 and id=$2',[owner,id])).rows[0].row;
assert.equal((await linkedWork()).bookingClientId,client);assert.equal((await linkedWork()).clientId,contact.id);assert.deepEqual(await privateSnapshot(),before);
const savedWork=await linkedWork();for(const patch of [{start:time(9)},{end:time(9)},{service:'Changed outside request'},{clientId:'missing'},{bookingClientId:outsider}]){await assert.rejects(async()=>db.query('select pro_patch_core($1,$2,$3,$4)',[owner,'work',{...savedWork,...patch},await coreRevision()]));assert.deepEqual(await linkedWork(),savedWork);}
const cancelled=await mutate(client,change('cancel',request.id,accepted.revision,{note:'Cancelación de prueba'}));assert.equal(cancelled.status,'cancelled');assert.equal((await linkedWork()).cancelled,true);assert.ok((await detail(client,request.id)).events.some(event=>event.action==='cancel'));
assert.deepEqual(await privateSnapshot(),before);
// Two pending requests may ask for the same time; only one can become a booking.
const first=make({start:time(14),preference:''}),second=make({start:time(14),preference:''});const firstSaved=await mutate(client,first),secondSaved=await mutate(outsider,second);
const winner=await mutate(owner,change('confirm',first.id,firstSaved.revision));await assert.rejects(()=>mutate(owner,change('confirm',second.id,secondSaved.revision)),error=>error.code==='40001');assert.equal((await detail(outsider,second.id)).request.status,'requested');
assert.equal((await db.query('select count(*)::int n from pro_work where user_id=$1 and not cancelled and pro_instant(start)<$2::timestamptz and pro_instant("end")>$3::timestamptz',[owner,time(16),time(14)])).rows[0].n,1);
// Completing through the owner agenda syncs the request and keeps its history.
const completeWork=await linkedWork(winner.workId);await db.query('select pro_patch_core($1,$2,$3,$4)',[owner,'work',{...completeWork,stage:'completed'},await coreRevision()]);const completed=await detail(client,first.id);assert.equal(completed.request.status,'completed');assert.ok(completed.events.some(event=>event.status==='completed'));
await assert.rejects(()=>mutate(client,change('cancel',first.id,completed.request.revision,{note:'Cannot cancel completed'})));
// Read history is not a fresh grant to mutate, and no third account gains access.
await db.query('update professionals set is_banned=true where id=$1',[professional]);await assert.rejects(()=>mutate(client,make()),error=>error.code==='42501');assert.equal((await detail(client,first.id)).request.status,'completed');await db.query('update professionals set is_banned=false where id=$1',[professional]);
await db.query("update pro_memberships set expires_at=now()-interval '1 day' where user_id=$1",[owner]);await assert.rejects(()=>mutate(client,make()),error=>error.code==='42501');await db.query('update pro_memberships set expires_at=null where user_id=$1',[owner]);
await db.query('update profiles set is_disabled=true where id=$1',[client]);await assert.rejects(()=>mutate(client,make()),error=>error.code==='42501');await db.query('update profiles set is_disabled=false where id=$1',[client]);
await assert.rejects(()=>mutate(owner,make()),error=>error.code==='42501');const proClientRequest=make({service:'Cliente con Pro activo'}),proClientSaved=await mutate(otherOwner,proClientRequest);assert.equal(proClientSaved.status,'requested');await mutate(owner,change('decline',proClientRequest.id,proClientSaved.revision,{note:''}));
// Histories and queues are bounded and cursor pages do not duplicate rows.
const historyRequest=make({service:'Historial paginado'}),historySaved=await mutate(client,historyRequest);let rev=historySaved.revision;
for(let i=0;i<24;i++){const r=await mutate(owner,change('propose',historyRequest.id,rev,{start:time(i%2?12:8,laterDay),durationMinutes:120,note:'Propuesta '+i}));rev=r.revision;}
const history1=await detail(client,historyRequest.id),history2=await detail(client,historyRequest.id,history1.nextCursor);assert.equal(history1.events.length,20);assert.ok(history1.nextCursor);assert.equal(history2.nextCursor,null);assert.equal(new Set([...history1.events,...history2.events].map(event=>event.position)).size,25);
for(let i=0;i<42;i++){const input=make({service:'Solicitud paginada '+i}),saved=await mutate(client,input);await mutate(owner,change('decline',input.id,saved.revision,{note:'Solicitud cerrada para comprobar paginación'}));}const pages=[];let after=null;do{const current=await page(client,'client',after);assert.ok(current.items.length<=20);pages.push(...current.items);after=current.nextCursor;}while(after);assert.equal(new Set(pages.map(row=>row.id)).size,pages.length);assert.ok(pages.length>=45);
assert.ok((await page(client,'client',null,'completed')).items.every(row=>row.status==='completed'));
// Open-request cap, exact replay at the cap, and safe closure after Pro expires.
const capped=[];for(let i=0;i<19;i++){const input=make({service:'Límite '+i}),saved=await mutate(outsider,input);capped.push({input,saved});}
await assert.rejects(()=>mutate(outsider,make()),error=>error.code==='54000');assert.deepEqual(await mutate(outsider,capped[0].input),capped[0].saved);
await db.query("update pro_memberships set expires_at=now()-interval '1 day' where user_id=$1",[owner]);
await mutate(outsider,change('cancel',capped[0].input.id,capped[0].saved.revision,{note:'Cierre seguro tras vencimiento'}));
await mutate(owner,change('decline',capped[1].input.id,capped[1].saved.revision,{note:'Cierre por profesional vencido'}));
await db.query('update pro_memberships set expires_at=null where user_id=$1',[owner]);
const createdToday=Number((await db.query('select count(*)::int n from pro_appointment_requests where client_user_id=$1',[client])).rows[0].n);
for(let i=createdToday;i<100;i++){const input=make({service:'Límite diario '+i}),saved=await mutate(client,input);await mutate(owner,change('decline',input.id,saved.revision,{note:''}));}
await assert.rejects(()=>mutate(client,make()),error=>error.code==='54000');
for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const query of ['select * from pro_appointment_requests',`select pro_appointment_detail('${client}','${request.id}',null)`,`select pro_appointment_mutate('${client}','{}'::jsonb)`])await assert.rejects(()=>db.query(query),error=>error.code==='42501');await db.exec('reset role');}
await db.query('update professionals set slug=$2 where id=$1',[professional,'provider-renamed']);assert.equal((await detail(client,historyRequest.id)).request.professionalSlug,'provider-renamed');assert.ok((await page(client)).items.every(row=>row.professionalSlug==='provider-renamed'));
const beforeReinstall=await detail(client,historyRequest.id);await db.exec(sql);assert.deepEqual(await detail(client,historyRequest.id),beforeReinstall);assert.deepEqual(await privateSnapshot(),before);
await db.close();console.log('PASS appointment request state machine, parties/privacy, shared agenda conflicts, 120-minute duration, CAS/retries, history/pagination, RLS, preservation and reinstall');
