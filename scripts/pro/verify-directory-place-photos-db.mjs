// LOCAL PRO ONLY (launch round, 2026-11-18): in-memory PGlite verification of directory-place-photos-local.sql.
// Owner/team photos publish at once, signed-in people upload pending, review photos need the uploader's review, dedupe by
// sha256, caps, removal, reports, staff queue + moderation (CAS, reasons, idempotency, no self-moderation, log),
// public reads (approved only), RLS/anon denial. Never opens a real database.
import assert from 'node:assert/strict';
import {setup,uuid,id,hex,code,hint} from './directory-features-db-harness.mjs';

const {q,call,call3,mk,claim,team,denied}=await setup(['directory-place-photos-local.sql']);
const owner=id(0xd1),manager=id(0xe1),member=id(0xe2),admin=id(0xad),ana=id(0xa1),beto=id(0xb1);
await mk(1);await mk(2);await claim(1,owner);
await team(manager,owner,'manager');await team(member,owner,'member');
const photo=(slug='lugar-1',over={})=>{const m=uuid(),b='dir-places/'+m+'/';
 return {actionId:uuid(),mediaId:m,slug,review:false,sha256:hex(uuid()),width:1600,height:1200,path1600:b+'1600.webp',path800:b+'800.webp',path320:b+'320.webp',url:'https://contratacr.com/api/fotos-lugar/'+m,...over};};
const add=(actor,member_,input)=>call3('dir_place_photo_add',actor,member_,input);
const pub=async(slug='lugar-1')=>(await q('select dir_place_photos_public($1) x',[slug]))[0].x;

// validation
for(const bad of [{url:'http://x.cr/api/fotos-lugar/1'},{sha256:'abc'},{width:'1600'},{path1600:'dir-listings/x/1600.webp'},{caption:'ver www.promo.cr'},{caption:'x'.repeat(201)},{extra:1}])
 await assert.rejects(()=>add(ana,null,photo('lugar-1',bad)),code('22023'),JSON.stringify(bad));
await assert.rejects(()=>add(ana,null,photo('no-existe')),code('P0002'));

// owner: published at once, provenance; idempotent
const o1in=photo('lugar-1',{caption:'  Terraza   al atardecer '});const o1=await add(owner,null,o1in);
assert.deepEqual([o1.photo.status,o1.photo.origin,o1.photo.caption],['approved','owner','Terraza al atardecer']);
assert.deepEqual(await add(owner,null,o1in),o1,'idempotent');
await assert.rejects(()=>add(owner,null,{...o1in,caption:'otra'}),code('22023'),'actionId reused');
assert.equal((await q("select count(*)::int n from dir_field_provenance where field='media' and source_id='owner'"))[0].n,1);
// team: manager role publishes, member role cannot
assert.equal((await add(owner,manager,photo())).photo.status,'approved');
await assert.rejects(()=>add(owner,member,photo()),hint('dir_tool_role'));
// dedupe by hash on the same place (another place is fine)
await assert.rejects(()=>add(ana,null,photo('lugar-1',{sha256:o1in.sha256})),hint('dir_photo_duplicate','23505'));
assert.equal((await add(ana,null,photo('lugar-2',{sha256:o1in.sha256}))).photo.status,'pending');

// signed-in person: pending, not public
const u1=await add(ana,null,photo());assert.deepEqual([u1.photo.status,u1.photo.origin],['pending','user']);
let list=await pub();assert.equal(list.length,2);assert.ok(!list.some(p=>p.id===u1.photo.id),'pending not public');
assert.ok(!JSON.stringify(list).includes(owner),'no uploader ids in public');
assert.equal((await q('select dir_place_photo_object($1) x',[u1.photo.id]))[0].x,null,'pending object not served');
assert.ok((await q('select dir_place_photo_object($1,true) x',[u1.photo.id]))[0].x.path800,'staff preview');
// review photos
await assert.rejects(()=>add(beto,null,photo('lugar-1',{review:true})),hint('dir_photo_review_missing'));
const rv=await call('dir_review_submit',beto,{actionId:uuid(),reviewId:uuid(),slug:'lugar-1',revision:0,rating:4,comment:'Muy bueno',authorName:'Beto'});
const r1=await add(beto,null,photo('lugar-1',{review:true}));assert.equal(r1.photo.reviewId,rv.reviewId);
await assert.rejects(()=>add(owner,null,photo('lugar-1',{review:true})),hint('dir_review_own_place'));
for(let i=0;i<4;i++)await add(beto,null,photo('lugar-1',{review:true}));
await assert.rejects(()=>add(beto,null,photo('lugar-1',{review:true})),hint('dir_photo_review_cap','54000'));
// daily cap per person (20)
for(let i=0;i<18;i++)await add(ana,null,photo('lugar-2'));
await assert.rejects(()=>add(ana,null,photo('lugar-2')),hint('dir_photo_cap','54000'));

// staff queue + moderation
let queue=(await q("select dir_admin_photo_queue('pending',200) x"))[0].x;assert.ok(queue.some(p=>p.id===u1.photo.id&&p.slug==='lugar-1'));
const mod=(over={})=>({actionId:uuid(),mediaId:u1.photo.id,decision:'approve',expectedStatus:'pending',...over});
await assert.rejects(()=>call('dir_admin_photo_moderate',admin,mod({decision:'reject'})),code('22023'),'reason to reject');
await assert.rejects(()=>call('dir_admin_photo_moderate',admin,mod({expectedStatus:'approved'})),code('40001'),'CAS');
await assert.rejects(()=>call('dir_admin_photo_moderate',owner,mod()),hint('dir_review_self_moderation'));
const apIn=mod();const ap=await call('dir_admin_photo_moderate',admin,apIn);assert.equal(ap.status,'approved');
assert.deepEqual(await call('dir_admin_photo_moderate',admin,apIn),ap,'idempotent');
assert.ok((await pub()).some(p=>p.id===u1.photo.id),'approved is public');
assert.ok((await q('select dir_place_photo_object($1) x',[u1.photo.id]))[0].x.path1600);
const rj=await call('dir_admin_photo_moderate',admin,{actionId:uuid(),mediaId:r1.photo.id,decision:'reject',reason:'No es del lugar',expectedStatus:'pending'});assert.equal(rj.status,'rejected');

// reports → remove/restore/dismiss
const flag=(actor,over={})=>call('dir_place_photo_flag_create',actor,{flagId:uuid(),mediaId:u1.photo.id,reason:'not_this_place',...over});
await assert.rejects(()=>flag(ana),hint('dir_photo_own_flag'));
await assert.rejects(()=>flag(null),code('22023'),'anonymous needs a device hash');
await flag(beto);await flag(null,{visitorHash:hex('device')});await flag(beto);
await assert.rejects(()=>call('dir_place_photo_flag_create',beto,{flagId:uuid(),mediaId:r1.photo.id,reason:'spam'}),code('P0002'),'only active photos');
queue=(await q("select dir_admin_photo_queue('flagged',50) x"))[0].x;assert.equal(queue[0].openFlags,2);
const rm=await call('dir_admin_photo_moderate',admin,{actionId:uuid(),mediaId:u1.photo.id,decision:'remove',reason:'Foto de otro negocio',expectedStatus:'approved'});
assert.equal(rm.status,'hidden');assert.ok(!(await pub()).some(p=>p.id===u1.photo.id));
assert.equal((await q("select count(*)::int n from dir_place_media_flags where status='upheld'"))[0].n,2);
assert.equal((await call('dir_admin_photo_moderate',admin,{actionId:uuid(),mediaId:u1.photo.id,decision:'restore',reason:'Revisado de nuevo',expectedStatus:'hidden'})).status,'approved');
assert.deepEqual((await q("select decision from dir_moderation_log where kind='photo' order by id")).map(r=>r.decision),['approve','reject','remove','restore']);

// removal by the uploader / manager; others cannot
await assert.rejects(()=>call3('dir_place_photo_remove',beto,null,{actionId:uuid(),mediaId:o1.photo.id}),hint('dir_photo_not_owner'));
assert.equal((await call3('dir_place_photo_remove',owner,manager,{actionId:uuid(),mediaId:o1.photo.id})).photo.status,'removed');
assert.equal((await call3('dir_place_photo_remove',ana,null,{actionId:uuid(),mediaId:u1.photo.id})).photo.status,'removed');
await assert.rejects(()=>call3('dir_place_photo_remove',ana,null,{actionId:uuid(),mediaId:u1.photo.id}),code('P0002'),'removed is final');
// the core public snapshot still lists only active media
const snap=(await q("select dir_place_public('lugar-1') x"))[0].x;assert.equal(snap.media.length,(await pub()).length);

await denied(['dir_place_media_flags'],["dir_place_photos_public('x')","dir_place_photo_add(null,null,'{}'::jsonb)","dir_admin_photo_moderate(null,'{}'::jsonb)","dir_place_photo_flag_create(null,'{}'::jsonb)"]);
console.log('PASS: place photos (owner/team publish, user pending, review photos, dedupe, caps, reports, staff queue + moderation log, removal, public reads, RLS/anon denial)');
