// LOCAL PRO ONLY (multivertical F5): in-memory PGlite verification of directory-reviews-local.sql (+ core and
// claims, which it depends on). SQL is read from DIR_SQL_DIR (default docs/pro/sql). Checks zod mirrors, half
// stars, one review per person per place, guest reviews only through a registered contact, name snapshot,
// moderation (protective trigger), owner reply once + moderated, rating aggregate, public reader, grants.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(libRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const dir=process.env.DIR_SQL_DIR||'docs/pro/sql';
const Z=await import('../../src/lib/directory/review-schemas.ts');
const uuid=()=>crypto.randomUUID(),code=c=>e=>{assert.equal(e.code,c,`${c} expected, got ${e.code}: ${e.message}`);return true;};
const hint=h=>e=>{assert.equal(e.hint,h,e.message);return true;};
const hex=s=>createHash('sha256').update(s).digest('hex');

// ---------------------------------------------------------------- zod mirrors
{const ok=(s,v)=>s.safeParse(v).success,b={actionId:uuid(),reviewId:uuid(),slug:'soda-uno',revision:0,rating:4.5,comment:'  Muy   buena atención '};
 const parsed=Z.reviewSubmitSchema().parse(b);assert.equal(parsed.comment,'Muy buena atención');
 for(const bad of [{...b,rating:4.3},{...b,rating:0},{...b,rating:5.5},{...b,comment:''},{...b,comment:'x'.repeat(301)},{...b,comment:'Visite www.otro.com'},{...b,comment:'escriban a @soda'},{...b,comment:'son unos idiotas'},{...b,extra:1}])
  assert.equal(ok(Z.reviewSubmitSchema(),bad),false,JSON.stringify(bad).slice(0,80));
 assert.equal(Z.reviewSubmitSchema('en').safeParse({...b,comment:''}).error.issues[0].message,'Write a comment to post your review.');
 assert.equal(ok(Z.guestReviewDbInputSchema,{...b,comment:'Bien',authorName:'Ana',contactId:uuid(),visitorHash:hex('d')}),true);
 assert.equal(ok(Z.guestReviewDbInputSchema,{...b,comment:'Bien',authorName:'Ana'}),false,'guest needs contact');
 assert.equal(ok(Z.ownerReplySchema,{actionId:uuid(),reviewId:uuid(),reply:'Gracias, visite https://x.cr'}),false);
 assert.equal(ok(Z.reviewModerationSchema,{actionId:uuid(),reviewId:uuid(),target:'review',status:'hidden'}),false,'reason to hide');
 assert.equal(ok(Z.contactRecordSchema,{contactId:uuid(),channel:'whatsapp',visitorHash:hex('d')}),true);}

// ---------------------------------------------------------------- database
const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;`);
const read=f=>readFile(join(dir,f),'utf8');
const core=await read('directory-core-local.sql'),claims=await read('directory-claims-local.sql'),reviews=await read('directory-reviews-local.sql');
await db.exec(core);await db.exec(claims);await db.exec(reviews);await db.exec(reviews);
await db.exec('update dir_claim_settings set sms_enabled=true'); // phone_listed (SMS) is OFF by default since 2026-11-17; these checks still claim by phone
await db.exec('set role service_role');
const q=async(text,params=[])=>(await db.query(text,params)).rows;
const call=async(fn,actor,input)=>(await q(`select ${fn}($1,$2) r`,[actor,input]))[0].r;
const staff='00000000-0000-4000-8000-0000000000aa',staff2='00000000-0000-4000-8000-0000000000ab',ana='00000000-0000-4000-8000-00000000a001',beto='00000000-0000-4000-8000-00000000b001',owner='00000000-0000-4000-8000-00000000d001';
const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const mutate=input=>call('dir_place_mutate',staff,{actionId:uuid(),...input});
const mk=async(n,vertical='restaurant',publish=true)=>{const r=await mutate({action:'create',placeId:id(n),revision:0,place:{slug:'lugar-'+n,vertical,name:'Lugar '+n,lat:9.93,lng:-84.08+n/1000,phone:'+506 2200 00'+String(n).padStart(2,'0')},source:{id:'osm',ref:'node/'+n}});
 if(publish)await mutate({action:'status',placeId:id(n),revision:r.revision,status:'published'});};
const agg=async n=>(await q('select rating_avg::text avg,rating_count n,revision from dir_places where id=$1',[id(n)]))[0];
const submit=(actor,input)=>call('dir_review_submit',actor,{actionId:uuid(),reviewId:uuid(),slug:'lugar-1',revision:0,rating:4,comment:'Muy bueno',authorName:'Ana Pérez',...input});
await mk(1);await mk(2,'pharmacy');await mk(3,'restaurant',false);
// 2026-11-17 (owner decision, same day): banks/ATMs and health places accept reviews about service/attention only
// (scope note in the UI); banks still show no prices, rates or products.
await mk(940,'banking');await mk(941,'health');
assert.equal((await submit(id(77001),{slug:'lugar-940',comment:'Atención rápida en ventanilla'})).status,'published','banks: service reviews allowed');
assert.equal((await submit(beto,{slug:'lugar-941',comment:'Atención amable y puntual'})).status,'published','health: service reviews allowed');

// owner of lugar-1 via a phone claim (claims module)
const cl=await call('dir_claim_open',owner,{actionId:uuid(),claimId:uuid(),slug:'lugar-1',method:'phone_listed'});
await call('dir_claim_send_code',owner,{actionId:uuid(),claimId:cl.claimId,codeHash:hex('c1')});
assert.equal((await call('dir_claim_verify_code',owner,{actionId:uuid(),claimId:cl.claimId,codeHash:hex('c1')})).status,'approved');
const rev0=(await agg(1)).revision;

// registered review: idempotent, half stars, snapshot, aggregate
const in1={actionId:uuid(),reviewId:uuid(),slug:'lugar-1',revision:0,rating:4.5,comment:'  Muy   buena   comida ',authorName:'Ana Pérez'};
const r1=await call('dir_review_submit',ana,in1);assert.deepEqual(r1,{reviewId:in1.reviewId,revision:1,status:'published'});
assert.deepEqual(await call('dir_review_submit',ana,in1),r1);
await assert.rejects(()=>call('dir_review_submit',ana,{...in1,rating:3}),code('22023'),'action id reused');
assert.deepEqual(await agg(1),{avg:'4.50',n:1,revision:rev0},'aggregate without revision bump');
assert.equal((await q('select comment from dir_reviews where id=$1',[in1.reviewId]))[0].comment,'Muy buena comida');
for(const bad of [{rating:4.3},{rating:0},{rating:5.5},{rating:'4'},{comment:''},{comment:'x'.repeat(301)},{comment:'ver https://x.cr'},{comment:'escriba a @soda'},{authorName:'A'},{revision:-1},{extra:true}])
 await assert.rejects(()=>submit(beto,bad),code('22023'),JSON.stringify(bad));
// one review per person and place: a second submission must edit the first (CAS)
await assert.rejects(()=>submit(ana,{}),code('40001'));
await assert.rejects(()=>submit(ana,{reviewId:in1.reviewId,revision:5}),code('40001'));
const e1=await submit(ana,{reviewId:in1.reviewId,revision:1,rating:3,comment:'Bajó un poco',authorName:'Ana P.'});assert.equal(e1.revision,2);
assert.deepEqual((await q('select count(*)::int n from dir_reviews where author_id=$1',[ana]))[0],{n:1});
assert.equal((await agg(1)).avg,'3.00');
await submit(beto,{rating:5,authorName:'Beto'});assert.deepEqual([(await agg(1)).avg,(await agg(1)).n],['4.00',2]);
// managers cannot review their own place; unpublished / unlicensed pharmacy not reviewable
await assert.rejects(()=>submit(owner,{}),hint('dir_review_own_place'));
// Owner decision 2026-11-17: pharmacies are public without a verified licence; the per-vertical gate is kept.
assert.notEqual((await q("select dir_place_public('lugar-2') p"))[0].p,null,'unverified pharmacy is public (so reviewable)');
await db.exec("reset role;update dir_verticals set requires_license=true where id='pharmacy';set role service_role");
await assert.rejects(()=>submit(beto,{slug:'lugar-2'}),code('P0002'),'gate on: pharmacy without license');
await db.exec("reset role;update dir_verticals set requires_license=false where id='pharmacy';set role service_role");
await assert.rejects(()=>submit(beto,{slug:'lugar-3'}),code('P0002'),'draft');

// guests: only with a contact registered for this place from this device
const dev=hex('device-1'),contact={contactId:uuid(),channel:'whatsapp',visitorHash:dev};
assert.deepEqual((await q('select dir_place_contact_record(null,$1,$2) r',['lugar-1',contact]))[0].r,{contactId:contact.contactId});
assert.deepEqual((await q('select dir_place_contact_record(null,$1,$2) r',['lugar-1',contact]))[0].r,{contactId:contact.contactId});
await assert.rejects(()=>q('select dir_place_contact_record(null,$1,$2)',['lugar-1',{...contact,channel:'call'}]),code('22023'));
await assert.rejects(()=>q('select dir_place_contact_record(null,$1,$2)',['lugar-3',{...contact,contactId:uuid()}]),code('P0002'));
await assert.rejects(()=>submit(null,{}),hint('dir_review_contact_required'));
await assert.rejects(()=>submit(null,{contactId:uuid(),visitorHash:dev}),hint('dir_review_contact_required'),'unknown contact');
await assert.rejects(()=>submit(null,{contactId:contact.contactId,visitorHash:hex('other-device')}),hint('dir_review_contact_required'),'other device');
await mk(4);const c4={contactId:uuid(),channel:'call',visitorHash:dev};await q('select dir_place_contact_record(null,$1,$2)',['lugar-4',c4]);
await assert.rejects(()=>submit(null,{contactId:c4.contactId,visitorHash:dev}),hint('dir_review_contact_required'),'contact for another place');
await assert.rejects(()=>submit(ana,{contactId:contact.contactId,visitorHash:dev}),code('22023'),'registered authors do not pass contacts');
const g={reviewId:uuid(),contactId:contact.contactId,visitorHash:dev,rating:2.5,comment:'Tardaron mucho',authorName:'Invitado Uno'};
const gr=await submit(null,g);assert.equal(gr.status,'published');
const c1b={contactId:uuid(),channel:'message',visitorHash:dev};await q('select dir_place_contact_record(null,$1,$2)',['lugar-1',c1b]);
await assert.rejects(()=>submit(null,{...g,reviewId:uuid(),contactId:c1b.contactId}),code('40001'),'one guest review per device and place');
assert.equal((await submit(null,{...g,revision:1,rating:3.5,comment:'Mejoraron'})).revision,2);
await db.exec('reset role');
await assert.rejects(()=>db.query('update dir_place_contacts set channel=channel'),code('23514'));
const old={contactId:uuid(),channel:'call',visitorHash:hex('device-2')};
await db.exec('set role service_role');await q('select dir_place_contact_record(null,$1,$2)',['lugar-1',old]);await db.exec('reset role');
await db.exec("alter table dir_place_contacts disable trigger dir_place_contacts_immutable");await db.query("update dir_place_contacts set created_at=now()-interval '91 days' where id=$1",[old.contactId]);await db.exec("alter table dir_place_contacts enable trigger dir_place_contacts_immutable");
await db.exec('set role service_role');
await assert.rejects(()=>submit(null,{contactId:old.contactId,visitorHash:old.visitorHash}),hint('dir_review_contact_required'),'contact older than 90 days');
assert.deepEqual([(await agg(1)).avg,(await agg(1)).n],['3.83',3]);

// moderation: only through dir_review_moderate (protective trigger), reversible, aggregate follows
await assert.rejects(()=>db.query("update dir_reviews set moderation_status='hidden',moderation_reason='x x x' where id=$1",[in1.reviewId]),hint('dir_review_moderation_only'));
await assert.rejects(()=>db.query("insert into dir_reviews(id,place_id,author_id,author_name_snapshot,rating,comment,moderation_status,moderation_reason) values($1,$2,$3,'Zeta',5,'ok','hidden','spam')",[uuid(),id(1),staff2]),hint('dir_review_moderation_only'));
await assert.rejects(()=>db.query("update dir_reviews set author_id=$2 where id=$1",[in1.reviewId,beto]),code('23514'));
await assert.rejects(()=>call('dir_review_moderate',ana,{actionId:uuid(),reviewId:in1.reviewId,target:'review',status:'hidden',reason:'Me arrepentí'}),hint('dir_review_self_moderation'));
await assert.rejects(()=>call('dir_review_moderate',staff,{actionId:uuid(),reviewId:in1.reviewId,target:'review',status:'hidden'}),code('22023'));
const hide={actionId:uuid(),reviewId:in1.reviewId,target:'review',status:'hidden',reason:'Contenido ofensivo'};
const m1=await call('dir_review_moderate',staff,hide);assert.equal(m1.status,'hidden');assert.deepEqual(await call('dir_review_moderate',staff,hide),m1);
assert.deepEqual([(await agg(1)).avg,(await agg(1)).n],['4.25',2]);
assert.notEqual((await q("select current_setting('dir.review_moderation',true) s"))[0].s,'on','flag closed after moderation');
const mine=(await q('select dir_review_mine($1,$2) r',[ana,'lugar-1']))[0].r;assert.deepEqual([mine.status,mine.moderationReason],['hidden','Contenido ofensivo']);
assert.equal((await submit(ana,{reviewId:in1.reviewId,revision:2,rating:5,comment:'Editada'})).status,'hidden','edit does not republish');
assert.equal((await agg(1)).n,2);
await call('dir_review_moderate',staff,{actionId:uuid(),reviewId:in1.reviewId,target:'review',status:'published'});
assert.deepEqual([(await agg(1)).avg,(await agg(1)).n],['4.50',3]);

// owner reply: manager only, once, final, moderated separately
const bReview=(await q('select id from dir_reviews where author_id=$1',[beto]))[0].id;
await assert.rejects(()=>call('dir_review_reply',beto,{actionId:uuid(),reviewId:bReview,reply:'Gracias'}),code('42501'));
await assert.rejects(()=>call('dir_review_reply',owner,{actionId:uuid(),reviewId:bReview,reply:'Visite www.x.cr'}),code('22023'));
const rp={actionId:uuid(),reviewId:bReview,reply:'¡Gracias por su visita!'};const rr=await call('dir_review_reply',owner,rp);assert.equal(rr.ownerReplyStatus,'published');
assert.deepEqual(await call('dir_review_reply',owner,rp),rr);
await assert.rejects(()=>call('dir_review_reply',owner,{actionId:uuid(),reviewId:bReview,reply:'Otra respuesta'}),hint('dir_review_reply_exists'));
await assert.rejects(()=>db.query("update dir_reviews set owner_reply='cambiada' where id=$1",[bReview]),hint('dir_review_reply_final'));
await assert.rejects(()=>db.query("update dir_reviews set owner_reply_status='hidden' where id=$1",[bReview]),hint('dir_review_moderation_only'));
await assert.rejects(()=>call('dir_review_moderate',owner,{actionId:uuid(),reviewId:bReview,target:'reply',status:'hidden',reason:'auto'}),hint('dir_review_self_moderation'));
await assert.rejects(()=>call('dir_review_moderate',staff,{actionId:uuid(),reviewId:in1.reviewId,target:'reply',status:'hidden',reason:'No hay'}),code('P0002'));
await call('dir_review_moderate',staff,{actionId:uuid(),reviewId:bReview,target:'reply',status:'hidden',reason:'Datos personales del cliente'});
assert.equal((await agg(1)).n,3,'hiding a reply keeps the review');
await assert.rejects(()=>call('dir_review_reply',owner,{actionId:uuid(),reviewId:bReview,reply:'Nueva'}),hint('dir_review_reply_exists'),'reply stays once even when hidden');

// public reader: published only, no internal author/contact ids, reply only when published, pagination
let pub=(await q('select dir_place_reviews_public($1) r',['lugar-1']))[0].r;
assert.deepEqual(pub.summary,{average:4.5,count:3});assert.equal(pub.items.length,3);assert.equal(pub.nextCursor,null);
const txt=JSON.stringify(pub);for(const x of [ana,beto,owner,staff,contact.contactId,dev])assert.equal(txt.includes(x),false);
assert.equal(pub.items.find(i=>i.guest).name,'Invitado Uno');assert.equal(pub.items.every(i=>i.ownerReply===null),true);
await call('dir_review_moderate',staff2,{actionId:uuid(),reviewId:bReview,target:'reply',status:'published'});
pub=(await q('select dir_place_reviews_public($1) r',['lugar-1']))[0].r;assert.equal(pub.items.find(i=>i.ownerReply).ownerReply.text,'¡Gracias por su visita!');
await call('dir_review_moderate',staff,{actionId:uuid(),reviewId:gr.reviewId,target:'review',status:'hidden',reason:'Reseña duplicada'});
pub=(await q('select dir_place_reviews_public($1) r',['lugar-1']))[0].r;assert.equal(pub.items.length,2);assert.equal(pub.items.some(i=>i.guest),false);
for(let i=0;i<23;i++)await submit(id(9000+i),{slug:'lugar-4',rating:1+(i%9)/2,comment:'Reseña '+i,authorName:'Persona '+i});
const p1=(await q('select dir_place_reviews_public($1) r',['lugar-4']))[0].r;assert.equal(p1.items.length,20);assert.ok(p1.nextCursor);
const p2=(await q('select dir_place_reviews_public($1,$2) r',['lugar-4',p1.nextCursor]))[0].r;assert.equal(p2.items.length,3);assert.equal(p2.nextCursor,null);
assert.equal(new Set([...p1.items,...p2.items].map(i=>i.id)).size,23);
await assert.rejects(()=>q('select dir_place_reviews_public($1,$2)',['lugar-4',{at:'x',id:'y'}]),code('22023'));
assert.equal((await q('select dir_place_reviews_public($1) r',['lugar-3']))[0].r,null);
const exp=(await q("select round(avg(rating),2)::text a,count(*)::int n from dir_reviews where place_id=$1 and moderation_status='published'",[id(4)]))[0];
assert.deepEqual([(await agg(4)).avg,(await agg(4)).n],[exp.a,exp.n]);
for(let i=0;i<9;i++){await mk(30+i);await submit(id(9000),{slug:'lugar-'+(30+i),authorName:'Cap'});}
await mk(40);await assert.rejects(()=>submit(id(9000),{slug:'lugar-40',authorName:'Cap'}),hint('dir_review_cap'),'10 reviews a day');
const admin=(await q("select dir_review_admin_list('hidden') r"))[0].r;assert.equal(admin.length,1);assert.equal(admin[0].reviewId,gr.reviewId);

// never deleted, grants, RLS, security invoker
await db.exec('reset role');
await assert.rejects(()=>db.exec('delete from dir_reviews'),code('23514'));await assert.rejects(()=>db.exec('truncate dir_reviews cascade'),code('23514'));
await db.exec('set role service_role');
for(const t of ['dir_reviews','dir_place_contacts'])await assert.rejects(()=>db.exec(`delete from ${t}`),code('42501'));
for(const role of ['anon','authenticated']){
 await db.exec(`reset role;set role ${role}`);
 for(const t of ['dir_reviews','dir_place_contacts'])await assert.rejects(()=>db.exec(`select * from ${t}`),code('42501'));
 await assert.rejects(()=>q('select dir_place_reviews_public($1)',['lugar-1']),code('42501'));
 await assert.rejects(()=>submit(ana,{slug:'lugar-4'}),code('42501'));
}
await db.exec('reset role');
assert.equal((await q("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dir\\_%' and (p.prosecdef or not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%'))"))[0].n,0);
assert.equal((await q("select count(*)::int n from pg_class where relname like 'dir\\_%' and relkind='r' and not relrowsecurity"))[0].n,0);
const snap=await q('select id,revision,moderation_status from dir_reviews order by id');await db.exec(core);await db.exec(claims);await db.exec(reviews);
assert.deepEqual(await q('select id,revision,moderation_status from dir_reviews order by id'),snap);
await db.close();
console.log('PASS directory reviews: banks and health accept service reviews (2026-11-17), zod mirrors (half stars, validateReviewText ES/EN, guest contact, reply without links, reason to hide), module applied 3× with core+claims, idempotent submit, 11 invalid inputs, one review per person per place (edit with CAS), managers cannot review their place, unpublished/unlicensed places refused, guests only via a contact registered for that place and device (≤90 days, one per device), name snapshot, moderation only through dir_review_moderate (protective trigger on insert/update, no self-moderation, reversible, edit keeps hidden), owner reply once/final/moderated separately, rating_avg/rating_count from published reviews without revision bump, public reader without internal ids + pagination, daily cap, admin list, never deleted, RLS/grants, security invoker.');
