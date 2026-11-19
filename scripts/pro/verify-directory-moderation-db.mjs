// LOCAL PRO ONLY (multivertical M1): in-memory PGlite verification of directory-moderation-local.sql on top of core,
// claims, reviews and price observations (manifest order). SQL is read from DIR_SQL_DIR (default docs/pro/sql).
// Checks: review flags (one per person/device, own review refused, cap), owner reply create/edit with CAS + immutable
// history (also for replies written by the older one-shot function), team member role gate, staff queue decisions
// for reviews/replies, price reports, place reports (fix/hide/recategorize/reject), pharmacy permits, staff-reviewed
// claims (uploads owned by the claimant), idempotent actionId receipts, CAS 40001, immutable audit log, grants.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const dir=process.env.DIR_SQL_DIR||'docs/pro/sql';
const uuid=()=>crypto.randomUUID(),code=c=>e=>{assert.equal(e.code,c,`${c} expected, got ${e.code}: ${e.message}`);return true;};
const hint=h=>e=>{assert.equal(e.hint,h,`${h} expected, got ${e.hint} (${e.code}: ${e.message})`);return true;};
const hex=s=>createHash('sha256').update(s).digest('hex');

const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;`);
const read=f=>readFile(join(dir,f),'utf8');
const files=['directory-core-local.sql','directory-claims-local.sql','directory-reviews-local.sql','price-observations-local.sql','directory-moderation-local.sql','dir-business-roles-local.sql'];
const sql=await Promise.all(files.map(read));
for(const s of sql)await db.exec(s);
await db.exec(sql[4]); // idempotent
await db.exec('update dir_claim_settings set sms_enabled=true'); // phone_listed (SMS) is OFF by default since 2026-11-17; these checks still claim by phone
await db.exec('set role service_role');
const q=async(text,params=[])=>(await db.query(text,params)).rows;
const call=async(fn,actor,input)=>(await q(`select ${fn}($1,$2) r`,[actor,input]))[0].r;
const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const staff=id(0xaa),admin=id(0xad),ana=id(0xa1),beto=id(0xb1),owner=id(0xd1),member=id(0xe1);
const mutate=input=>call('dir_place_mutate',staff,{actionId:uuid(),...input});
const mk=async(n,vertical='restaurant',{publish=true,attributes}={})=>{const r=await mutate({action:'create',placeId:id(n),revision:0,source:{id:'osm',ref:'node/'+n},
 place:{slug:'lugar-'+n,vertical,name:'Lugar '+n,lat:9.93,lng:-84.08+n/1000,phone:'+506 2200 00'+String(n).padStart(2,'0'),...(attributes?{attributes}:{})}});
 if(publish)return (await mutate({action:'status',placeId:id(n),revision:r.revision,status:'published'})).revision;return r.revision;};
const rev=async n=>(await q('select revision from dir_places where id=$1',[id(n)]))[0].revision;
const logCount=async()=>(await q('select count(*)::int n from dir_moderation_log'))[0].n;
await mk(1);await mk(2,'pharmacy');await mk(3,'pharmacy',{publish:false});await mk(4,'grocery');await mk(5,'restaurant',{attributes:{cuisines:['tico'],priceLevel:2}});await mk(6);await mk(7);

// owner of lugar-1 (phone claim)
const cl=await call('dir_claim_open',owner,{actionId:uuid(),claimId:uuid(),slug:'lugar-1',method:'phone_listed'});
await call('dir_claim_send_code',owner,{actionId:uuid(),claimId:cl.claimId,codeHash:hex('c1')});
assert.equal((await call('dir_claim_verify_code',owner,{actionId:uuid(),claimId:cl.claimId,codeHash:hex('c1')})).status,'approved');
const review=(actor,input={})=>call('dir_review_submit',actor,{actionId:uuid(),reviewId:uuid(),slug:'lugar-1',revision:0,rating:4,comment:'Muy bueno',authorName:'Persona',...input});
const anaReview=(await review(ana,{comment:'Comida rica'})).reviewId,betoReview=(await review(beto,{rating:2,comment:'Lento'})).reviewId;

// ---------------------------------------------------------------- flags
const flag=(actor,input)=>call('dir_review_flag_create',actor,{flagId:uuid(),reviewId:anaReview,reason:'spam',...input});
const f1={flagId:uuid(),reviewId:anaReview,reason:'offensive',message:'  Insulta   al personal '};
assert.deepEqual(await call('dir_review_flag_create',beto,f1),{ok:true});
assert.deepEqual(await call('dir_review_flag_create',beto,f1),{ok:true},'same flagId → same answer');
await assert.rejects(()=>call('dir_review_flag_create',beto,{...f1,reason:'spam'}),code('22023'),'flagId reused');
assert.deepEqual(await flag(beto,{}),{ok:true},'second flag of the same person is absorbed');
assert.equal((await q('select count(*)::int n,max(message) m from dir_review_flags where review_id=$1',[anaReview]))[0].n,1);
assert.equal((await q('select message from dir_review_flags where review_id=$1',[anaReview]))[0].message,'Insulta al personal');
await assert.rejects(()=>flag(ana,{}),hint('dir_flag_own_review'));
const dev=hex('device-flag');assert.deepEqual(await flag(null,{visitorHash:dev}),{ok:true},'guest flag with a device hash');
for(const bad of [{reason:'boring'},{reason:'other'},{message:'x'.repeat(501)},{visitorHash:'abc'},{extra:1},{reviewId:'nope'}])await assert.rejects(()=>flag(owner,bad),code('22023'),JSON.stringify(bad));
await assert.rejects(()=>flag(null,{}),code('22023'),'anonymous without device');
await assert.rejects(()=>flag(owner,{reviewId:uuid()}),code('P0002'));
for(let i=0;i<20;i++){const r=(await review(id(9000+i),{slug:'lugar-6',comment:'Reseña '+i})).reviewId;await call('dir_review_flag_create',id(0xf0),{flagId:uuid(),reviewId:r,reason:'fake'});}
const r21=(await review(id(9100),{slug:'lugar-6',comment:'Otra'})).reviewId;
await assert.rejects(()=>call('dir_review_flag_create',id(0xf0),{flagId:uuid(),reviewId:r21,reason:'fake'}),hint('dir_flag_cap'));

// ---------------------------------------------------------------- owner reply with history
const reply=(actor,input,mem=null)=>q('select dir_review_reply_write($1,$2,$3) r',[actor,mem,{actionId:uuid(),reviewId:anaReview,...input}]).then(r=>r[0].r);
await assert.rejects(()=>reply(beto,{reply:'Gracias',replyRevision:0}),hint('dir_reply_not_manager'));
await assert.rejects(()=>reply(owner,{reply:'Vea www.x.cr',replyRevision:0}),code('22023'));
await assert.rejects(()=>reply(owner,{reply:'Gracias',replyRevision:'0'}),code('22023'));
await assert.rejects(()=>reply(owner,{reply:'Gracias',replyRevision:0},member),hint('dir_reply_role'),'member without the team-roles module');
const w1={actionId:uuid(),reviewId:anaReview,reply:'¡Gracias por venir!',replyRevision:0};
const a1=(await q('select dir_review_reply_write($1,null,$2) r',[owner,w1]))[0].r;assert.deepEqual(a1,{reviewId:anaReview,replyRevision:1,ownerReplyStatus:'published'});
assert.deepEqual((await q('select dir_review_reply_write($1,null,$2) r',[owner,w1]))[0].r,a1,'idempotent');
await assert.rejects(()=>reply(owner,{reply:'Otra',replyRevision:0}),code('40001'),'a second first reply is a stale write');
const a2=await reply(owner,{reply:'¡Gracias por venir! Le esperamos pronto.',replyRevision:1});assert.equal(a2.replyRevision,2);
await assert.rejects(()=>reply(owner,{reply:'Tarde',replyRevision:1}),code('40001'),'stale reply revision');
await assert.rejects(()=>reply(owner,{reply:'¡Gracias por venir! Le esperamos pronto.',replyRevision:2}),code('22023'),'nothing to change');
await assert.rejects(()=>db.query("update dir_reviews set owner_reply='cambiada' where id=$1",[anaReview]),hint('dir_review_reply_final'));
await assert.rejects(()=>db.query("update dir_reviews set owner_reply_revision=9 where id=$1",[anaReview]),hint('dir_review_reply_final'));
assert.deepEqual((await q('select revision,reply from dir_review_reply_history where review_id=$1 order by revision',[anaReview])).map(r=>[r.revision,r.reply]),
 [[1,'¡Gracias por venir!'],[2,'¡Gracias por venir! Le esperamos pronto.']]);
await assert.rejects(()=>db.query('update dir_review_reply_history set reply=$1',['x']),code('42501'),'service role has no update grant');
// a reply written by the one-shot function of the reviews module gets revision 1 and keeps its text in history on edit
await call('dir_review_reply',owner,{actionId:uuid(),reviewId:betoReview,reply:'Lamentamos la espera'});
assert.equal((await q('select owner_reply_revision r from dir_reviews where id=$1',[betoReview]))[0].r,1);
await q('select dir_review_reply_write($1,null,$2)',[owner,{actionId:uuid(),reviewId:betoReview,reply:'Lamentamos la espera; ya sumamos personal.',replyRevision:1}]);
assert.deepEqual((await q('select revision from dir_review_reply_history where review_id=$1 order by revision',[betoReview])).map(r=>r.revision),[1,2]);
let pub=(await q('select dir_place_reviews_public($1) r',['lugar-1']))[0].r;
const pa=pub.items.find(i=>i.id===anaReview).ownerReply;assert.equal(pa.text,'¡Gracias por venir! Le esperamos pronto.');assert.equal(pa.edited,true);assert.ok(pa.editedAt);
assert.equal(JSON.stringify(pub).includes(owner),false,'no manager ids in the public reader');
const targets=(await q('select dir_review_reply_targets($1,$2) r',[owner,'lugar-1']))[0].r;
assert.deepEqual(targets.map(t=>t.replyRevision).sort(),[2,2]);
assert.equal((await q('select dir_review_reply_targets($1,$2) r',[beto,'lugar-1']))[0].r,null,'not a manager → null');
// member gate with a stub team module: admin/manager roles may publish replies, member/read_only may not
await db.exec('reset role');
await db.exec(`create table t_roles(m uuid,o uuid,r text);
 create function public.pro_role_of(p_actor uuid,p_owner uuid) returns text language sql stable set search_path=public,pg_temp as $$ select r from t_roles where m=p_actor and o=p_owner $$;
 create function public.pro_role_allows(p_role text,p_capability text) returns boolean language sql immutable set search_path=public,pg_temp as $$ select p_role in('admin','manager') and p_capability='listing.publish' or p_capability='read' $$;
 grant select on t_roles to service_role;grant execute on function public.pro_role_of(uuid,uuid),public.pro_role_allows(text,text) to service_role;`);
await db.query('insert into t_roles values($1,$2,$3)',[member,owner,'member']);
await db.exec('set role service_role');
const r7=(await review(id(9200),{comment:'Bien'})).reviewId;
await assert.rejects(()=>q('select dir_review_reply_write($1,$2,$3)',[owner,member,{actionId:uuid(),reviewId:r7,reply:'Gracias',replyRevision:0}]),hint('dir_reply_role'));
await db.exec('reset role');await db.query('update t_roles set r=$1',['manager']);await db.exec('set role service_role');
const mr=(await q('select dir_review_reply_write($1,$2,$3) r',[owner,member,{actionId:uuid(),reviewId:r7,reply:'Gracias',replyRevision:0}]))[0].r;assert.equal(mr.replyRevision,1);
assert.deepEqual((await q('select edited_by,member_id from dir_review_reply_history where review_id=$1',[r7]))[0],{edited_by:member,member_id:member});

// ---------------------------------------------------------------- staff: reviews
const mod=(actor,input)=>call('dir_admin_review_moderate',actor,{actionId:uuid(),reviewId:anaReview,target:'review',reason:'Lenguaje ofensivo',...input});
let queue=(await q("select dir_admin_review_queue('flagged') r"))[0].r;
const qa=queue.find(x=>x.reviewId===anaReview);assert.equal(qa.openFlags,2);assert.equal(qa.flags.length,2);assert.equal(JSON.stringify(queue).includes(ana),false,'no author ids in the queue');
await assert.rejects(()=>mod(admin,{decision:'hide',expectedStatus:'hidden'}),code('40001'),'expected state differs');
await assert.rejects(()=>mod(admin,{decision:'hide',expectedStatus:'published',reason:'no'}),code('22023'),'reason required');
await assert.rejects(()=>mod(admin,{decision:'restore',expectedStatus:'published'}),code('40001'),'restore a published review');
await assert.rejects(()=>mod(ana,{decision:'hide',expectedStatus:'published'}),hint('dir_review_self_moderation'));
const before=await logCount();
const hideIn={actionId:uuid(),reviewId:anaReview,target:'review',decision:'hide',reason:'Lenguaje ofensivo',expectedStatus:'published'};
const h1=await call('dir_admin_review_moderate',admin,hideIn);assert.deepEqual([h1.status,h1.flagsClosed],['hidden',2]);
assert.deepEqual(await call('dir_admin_review_moderate',admin,hideIn),h1,'idempotent');
await assert.rejects(()=>call('dir_admin_review_moderate',admin,{...hideIn,reason:'Otro motivo'}),code('22023'),'actionId reused');
assert.equal(await logCount(),before+1);
assert.deepEqual((await q('select status from dir_review_flags where review_id=$1',[anaReview])).map(r=>r.status),['upheld','upheld']);
assert.equal((await q("select dir_admin_review_queue('flagged') r"))[0].r.some(x=>x.reviewId===anaReview),false);
assert.equal((await q("select dir_admin_review_queue('hidden') r"))[0].r[0].reviewId,anaReview);
assert.equal((await q("select rating_count n from dir_places where id=$1",[id(1)]))[0].n,2,'aggregate follows');
await assert.rejects(()=>reply(owner,{reply:'Hola',replyRevision:2}),code('P0002'),'no reply edits on a hidden review');
assert.equal((await mod(admin,{decision:'restore',expectedStatus:'hidden',reason:'Revisado: no es ofensivo'})).status,'published');
const rh=await mod(admin,{target:'reply',decision:'hide',expectedStatus:'published',reason:'Datos personales'});assert.equal(rh.replyStatus,'hidden');
pub=(await q('select dir_place_reviews_public($1) r',['lugar-1']))[0].r;assert.equal(pub.items.find(i=>i.id===anaReview).ownerReply,null);
await assert.rejects(()=>mod(admin,{target:'reply',reviewId:r21,decision:'hide',expectedStatus:'published'}),code('P0002'));
const dz=await call('dir_admin_review_moderate',admin,{actionId:uuid(),reviewId:r21,target:'review',decision:'dismiss',reason:'Sin motivo real',expectedStatus:'published'});
assert.deepEqual([dz.status,dz.flagsClosed],['published',0],'the capped flag was never stored');

// ---------------------------------------------------------------- staff: price reports
await call('price_item_upsert',staff,{actionId:uuid(),slug:'arroz-1kg',kind:'grocery',name:'Arroz',presentation:'1 kg',unitBase:'kg',unitQty:1});
await call('price_item_upsert',staff,{actionId:uuid(),slug:'amoxicilina-500',kind:'medicine',name:'Amoxicilina',unitBase:'unit',unitQty:10,rxRequired:true});
const obs=(actor,input={})=>call('price_observation_record',actor,{actionId:uuid(),itemSlug:'arroz-1kg',placeSlug:'lugar-4',price:1450,sourceKind:'user_report',observedAt:new Date(Date.now()-3600e3).toISOString(),...input});
await assert.rejects(()=>obs(ana,{itemSlug:'amoxicilina-500',placeSlug:'lugar-4'}),hint('price_rx_not_public'));
const o1=await obs(ana);assert.equal(o1.moderationStatus,'pending');
const pq=(await q("select dir_admin_price_queue('pending') r"))[0].r;assert.equal(pq.length,1);assert.equal(pq[0].similarReports,1);assert.equal(JSON.stringify(pq).includes(ana),false);
const pm=(input)=>call('dir_admin_price_moderate',admin,{actionId:uuid(),observationId:o1.observationId,...input});
await assert.rejects(()=>pm({decision:'publish',expectedStatus:'published'}),code('40001'));
await assert.rejects(()=>pm({decision:'reject',expectedStatus:'pending'}),code('22023'),'reject needs a reason');
const pp=await pm({decision:'publish',expectedStatus:'pending'});assert.deepEqual([pp.moderationStatus,pp.confidence],['published','community']);
await assert.rejects(()=>pm({decision:'publish',expectedStatus:'pending'}),code('40001'),'already decided');
let cur=(await q("select public_price_current('lugar-4',null) r"))[0].r;assert.equal(cur.items[0].current.confidence,'community');assert.equal(cur.items[0].current.source.name,'Reportes de la comunidad / community reports');
assert.equal((await pm({decision:'reject',expectedStatus:'published',reason:'Precio irreal'})).moderationStatus,'rejected');
cur=(await q("select public_price_current('lugar-4',null) r"))[0].r;assert.equal(cur.items.length,0);

// ---------------------------------------------------------------- staff: place reports
const report=async(n,kind='wrong_info')=>{const rid=uuid();await q('select dir_report_create(null,$1,$2)',['lugar-'+n,{reportId:rid,kind,message:'El nombre está mal escrito'}]);return rid;};
const rr=(input)=>call('dir_admin_report_resolve',admin,{actionId:uuid(),reason:'Corregido según reporte',...input});
const rp1=await report(4);
assert.equal((await q('select dir_admin_report_queue() r'))[0].r[0].place.revision,await rev(4));
await assert.rejects(async()=>rr({reportId:rp1,decision:'fix',revision:(await rev(4))-1,place:{name:'Súper Cuatro'}}),code('40001'),'stale place revision');
await assert.rejects(async()=>rr({reportId:rp1,decision:'fix',revision:await rev(4),place:{slug:'otro'}}),code('22023'),'slug is not editable here');
await assert.rejects(async()=>rr({reportId:rp1,decision:'fix',revision:await rev(4)}),code('22023'),'fix needs place');
await assert.rejects(async()=>rr({reportId:rp1,decision:'hide',revision:await rev(4),reason:'x'}),code('22023'),'reason');
// 2026-11-17: the business e-mail (claim code destination, never public) is editable in the fix, lower-cased, provenance 'email'.
await assert.rejects(async()=>rr({reportId:rp1,decision:'fix',revision:await rev(4),place:{email:'no es correo'}}),e=>['22023','23514'].includes(e.code),'invalid e-mail');
assert.ok('email' in (await q('select dir_admin_report_queue() r'))[0].r[0].place,'queue shows the e-mail to staff');
const fx=await rr({reportId:rp1,decision:'fix',revision:await rev(4),place:{name:'Súper Cuatro',phone:'+506 2200 4444',email:'Caja@SuperCuatro.CR'}});
assert.equal((await q('select email from dir_places where id=$1',[id(4)]))[0].email,'caja@supercuatro.cr');
assert.equal((await q("select source_id from dir_field_provenance where place_id=$1 and field='email' order by id desc limit 1",[id(4)]))[0].source_id,'contratacr');
assert.equal(JSON.stringify((await q('select dir_place_public(slug) p from dir_places where id=$1',[id(4)]))[0].p).includes('supercuatro'),false,'never public');
assert.equal(fx.status,'accepted');assert.equal((await q('select name,phone from dir_places where id=$1',[id(4)]))[0].name,'Súper Cuatro');
await assert.rejects(()=>rr({reportId:rp1,decision:'reject'}),hint('dir_report_closed'));
assert.equal((await q("select source_id from dir_field_provenance where place_id=$1 and field='name' order by id desc limit 1",[id(4)]))[0].source_id,'contratacr');
const rp2=await report(5,'other');
const rc=await rr({reportId:rp2,decision:'recategorize',revision:await rev(5),vertical:'grocery'});assert.equal(rc.vertical,'grocery');
assert.deepEqual((await q('select attributes from dir_places where id=$1',[id(5)]))[0].attributes,{},'restaurant attributes dropped');
await assert.rejects(async()=>rr({reportId:await report(5),decision:'recategorize',revision:await rev(5),vertical:'grocery'}),code('22023'),'same vertical');
const rp3=await report(6,'closed');assert.equal((await rr({reportId:rp3,decision:'close',revision:await rev(6)})).placeStatus,'closed_permanently');
const rp4=await report(7,'removal_request');assert.equal((await rr({reportId:rp4,decision:'remove',revision:await rev(7)})).placeStatus,'removed');
const rp5=await report(1,'duplicate');assert.equal((await rr({reportId:rp5,decision:'reject',reason:'No es duplicado'})).status,'rejected');
const rp6=await report(1);assert.equal((await rr({reportId:rp6,decision:'hide',revision:await rev(1)})).placeStatus,'hidden');
await mutate({action:'status',placeId:id(1),revision:await rev(1),status:'published'});

// ---------------------------------------------------------------- staff: pharmacy permits
assert.equal((await q("select dir_place_public('lugar-3') r"))[0].r,null);
let ph=(await q("select dir_admin_pharmacy_queue('lugar') r"))[0].r;assert.equal(ph.total,2);
const pv=(n,input)=>call('dir_admin_pharmacy_verify',admin,{actionId:uuid(),placeId:id(n),permitNumber:'MS-1234-2026',evidence:{kind:'official_registry',reference:'Consulta del registro de establecimientos'},...input});
await assert.rejects(async()=>pv(3,{revision:(await rev(3))+1}),code('40001'));
await assert.rejects(async()=>pv(1,{revision:await rev(1)}),hint('dir_permit_vertical'));
await assert.rejects(async()=>pv(3,{revision:await rev(3),permitNumber:'!'}),code('22023'));
await assert.rejects(async()=>pv(3,{revision:await rev(3),evidence:{kind:'rumor',reference:'x'}}),code('22023'));
const v3in={actionId:uuid(),placeId:id(3),revision:await rev(3),permitNumber:'MS-1234-2026',evidence:{kind:'document',reference:'Permiso sanitario de funcionamiento escaneado',note:'Vence 2027'}};
const v3=await call('dir_admin_pharmacy_verify',admin,v3in);
assert.deepEqual([v3.status,v3.verificationLevel,v3.public],['published','license_verified',true]);
assert.deepEqual(await call('dir_admin_pharmacy_verify',admin,v3in),v3,'idempotent');
assert.equal((await q("select dir_place_public('lugar-3') r"))[0].r.attributes.licenseNumber,'MS-1234-2026');
assert.equal((await q('select count(*)::int n from dir_place_permits where place_id=$1',[id(3)]))[0].n,1);
ph=(await q("select dir_admin_pharmacy_queue('lugar') r"))[0].r;assert.equal(ph.total,1);assert.equal(ph.items[0].slug,'lugar-2');
// a verified pharmacy still never gets prescription prices
await assert.rejects(()=>obs(ana,{itemSlug:'amoxicilina-500',placeSlug:'lugar-3'}),hint('price_rx_not_public'));

// ---------------------------------------------------------------- staff-reviewed claims
const c1=uuid(),path1=`dir-claims/${c1}/municipal_license-1.pdf`;
const up=(actor,input={})=>call('dir_claim_upload_record',actor,{claimId:c1,path:path1,kind:'municipal_license',mime:'application/pdf',size:1000,sha256:hex('doc1'),...input});
assert.deepEqual(await up(ana),{path:path1,kind:'municipal_license'});assert.deepEqual(await up(ana),{path:path1,kind:'municipal_license'},'same upload twice');
await assert.rejects(()=>up(beto,{path:`dir-claims/${c1}/other.pdf`}),hint('dir_claim_upload_foreign'));
await assert.rejects(()=>up(ana,{path:`dir-claims/${uuid()}/x.pdf`}),code('22023'),'path of another claim id');
await assert.rejects(()=>up(ana,{path:`dir-claims/${c1}/x.exe`,mime:'application/x-msdownload'}),code('22023'));
const openDoc=(actor,docs,claimId=c1)=>call('dir_claim_open_reviewed',actor,{actionId:uuid(),claimId,slug:'lugar-4',method:'document_review',evidence:{documents:docs}});
await assert.rejects(()=>openDoc(beto,[{kind:'municipal_license',path:path1}]),hint('dir_claim_evidence'),'someone else\'s file');
await assert.rejects(()=>openDoc(ana,[{kind:'health_permit',path:path1}]),hint('dir_claim_evidence'),'kind differs from upload');
await assert.rejects(()=>call('dir_claim_open_reviewed',ana,{actionId:uuid(),claimId:uuid(),slug:'lugar-4',method:'phone_listed'}),code('22023'));
const oc=await openDoc(ana,[{kind:'municipal_license',path:path1}]);assert.equal(oc.status,'open');
await assert.rejects(()=>up(ana,{path:`dir-claims/${c1}/late.pdf`}),hint('dir_claim_upload_foreign'),'no uploads after opening');
const cq=(await q('select dir_claim_queue() r'))[0].r;assert.equal(cq[0].claimId,c1);
const dec=(actor,input)=>call('dir_admin_claim_decide',actor,{actionId:uuid(),claimId:c1,...input});
await assert.rejects(()=>dec(admin,{decision:'reject'}),code('22023'),'reject needs reason');
await assert.rejects(()=>dec(ana,{decision:'approve'}),hint('dir_claim_self_review'));
const ok=await dec(admin,{decision:'approve',reason:'Patente municipal coincide'});assert.deepEqual([ok.status,ok.verificationLevel],['approved','verified']);
await assert.rejects(()=>dec(admin,{decision:'reject',reason:'Tarde'}),code('40001'),'already decided');
assert.equal((await q('select claim_status from dir_places where id=$1',[id(4)]))[0].claim_status,'claimed');
// hacienda evidence (built by the server adapter) goes through the same wrapper
const c2=uuid();
const hz=await call('dir_claim_open_reviewed',beto,{actionId:uuid(),claimId:c2,slug:'lugar-2',method:'hacienda_juridica',
 evidence:{hacienda:{cedula:'3101000001',officialName:'Farmacia Dos Sociedad Anónima',score:1,matched:true,provider:'hacienda_api'}}});
assert.equal(hz.method,'hacienda_juridica');
assert.equal((await dec(admin,{claimId:c2,decision:'reject',reason:'El nombre legal no corresponde al local'})).status,'rejected');

// ---------------------------------------------------------------- audit log + grants
const kinds=(await q('select kind,count(*)::int n from dir_moderation_log group by kind order by kind')).map(r=>r.kind);
assert.deepEqual(kinds,['claim','permit','price','reply','report','review']);
assert.ok((await q('select dir_admin_moderation_log(5) r'))[0].r.length===5);
await db.exec('reset role');
await assert.rejects(()=>db.exec('update dir_moderation_log set reason=null'),code('23514'));
await assert.rejects(()=>db.exec('delete from dir_moderation_log'),code('23514'));
await assert.rejects(()=>db.exec('truncate dir_moderation_log'),code('23514'));
await assert.rejects(()=>db.exec('delete from dir_review_flags'),code('23514'));
await assert.rejects(()=>db.exec("update dir_review_flags set status='open' where status<>'open'"),code('23514'));
await assert.rejects(()=>db.exec('update dir_place_permits set permit_number=permit_number'),code('23514'));
await assert.rejects(()=>db.exec('update dir_claim_uploads set size=1'),code('23514'));
await assert.rejects(()=>db.exec("update dir_review_reply_history set reply='x'"),code('23514'));
for(const role of ['anon','authenticated']){
 await db.exec(`reset role;set role ${role}`);
 for(const t of ['dir_moderation_log','dir_review_flags','dir_review_reply_history','dir_claim_uploads','dir_place_permits'])await assert.rejects(()=>db.exec(`select * from ${t}`),code('42501'));
 for(const f of ['dir_admin_review_queue()','dir_admin_report_queue()','dir_admin_pharmacy_queue()','dir_admin_price_queue()'])await assert.rejects(()=>db.exec(`select ${f}`),code('42501'));
}
await db.exec('reset role');
assert.equal((await q("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dir\\_%' and (p.prosecdef or not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%'))"))[0].n,0);
assert.equal((await q("select count(*)::int n from pg_class where relname like 'dir\\_%' and relkind='r' and not relrowsecurity"))[0].n,0);
const snap=await q('select id,owner_reply_revision,moderation_status from dir_reviews order by id');await db.exec(sql[4]);
assert.deepEqual(await q('select id,owner_reply_revision,moderation_status from dir_reviews order by id'),snap,'re-applying keeps data');
await db.close();
console.log('PASS directory moderation: fix edits the private business e-mail (lower-cased, provenance, never public); module applied twice after core+claims+reviews+prices; review flags (one per person/device, own refused, idempotent flagId, 20/day cap); owner reply create/edit with CAS 40001 + immutable history (legacy replies keep revision 1), protective trigger, team role gate (admin/manager only), public reader shows «edited» without manager ids; staff review/reply hide-restore-dismiss with expected-state CAS, reasons, flags closed, no self-moderation; price reports publish/reject with CAS and reason, Rx refused even at a licensed pharmacy; place reports fix/hide/close/remove/recategorize/reject with place revision CAS and provenance; pharmacy permit → licenseNumber + license_verified + published; claim uploads owned by the claimant, document/Hacienda claims decided by staff (no self-review); every staff decision idempotent and in the immutable audit log; RLS, grants, security invoker.');
