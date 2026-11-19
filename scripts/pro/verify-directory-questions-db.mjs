// LOCAL PRO ONLY (place features round, 2026-11-17): in-memory PGlite verification of directory-questions-local.sql.
// Ask/answer (signed in only, no links, idempotent), business answer marked and first, team role for business answers,
// caps, flags (one per person, own text refused), staff moderation (CAS, reason, no self-moderation, flags closed,
// immutable log), public reader without ids, no edits/deletes, RLS/anon denial.
import assert from 'node:assert/strict';
import {setup,uuid,id,code,hint} from './directory-features-db-harness.mjs';

const {q,call,call3,mk,claim,team,denied,db}=await setup(['directory-questions-local.sql']);
const owner=id(0xd1),member=id(0xe1),reader=id(0xe2),ana=id(0xa1),beto=id(0xb1),carla=id(0xc1),admin=id(0xad);
await mk(1);await mk(2,'banking',{attributes:{kind:'bank'}});await mk(3,'restaurant',{publish:false});
await claim(1,owner);await team(member,owner,'manager');await team(reader,owner,'member');

const ask=(actor,over={})=>call('dir_question_ask',actor,{actionId:uuid(),questionId:uuid(),slug:'lugar-1',body:'¿Tienen parqueo para clientes?',authorName:'Ana Mora',...over});
await assert.rejects(()=>ask(null),hint('dir_qa_login','42501'),'sign in to ask');
const q1in={actionId:uuid(),questionId:uuid(),slug:'lugar-1',body:'  ¿Tienen   opciones veganas? ',authorName:'Ana Mora'};
const q1=await call('dir_question_ask',ana,q1in);assert.deepEqual(q1,{questionId:q1in.questionId,status:'published'});
assert.deepEqual(await call('dir_question_ask',ana,q1in),q1,'idempotent');
await assert.rejects(()=>call('dir_question_ask',ana,{...q1in,body:'Otra pregunta distinta'}),code('22023'),'actionId reused');
for(const bad of [{body:'¿Si?'},{body:'x'.repeat(301)},{body:'Vean www.otro.cr ahora'},{body:'Pregunten a @soda ya'},{authorName:'A'},{extra:1}])
 await assert.rejects(()=>ask(beto,bad),code('22023'),JSON.stringify(bad));
await assert.rejects(()=>ask(owner),hint('dir_qa_own_place'),'managers do not ask on their place');
await assert.rejects(()=>ask(beto,{slug:'lugar-3'}),code('P0002'),'unpublished place');
assert.equal((await ask(beto,{slug:'lugar-2',body:'¿El cajero recibe depósitos?'})).status,'published','every place page, banks too');

// answers
const answer=(actor,memberId,over={})=>call3('dir_answer_post',actor,memberId,{actionId:uuid(),answerId:uuid(),questionId:q1in.questionId,body:'Sí, varias.',authorName:'Beto',...over});
await assert.rejects(()=>answer(null,null),hint('dir_qa_login'));
await assert.rejects(()=>answer(ana,null),hint('dir_qa_own_question'),'not your own question');
const a1=await answer(beto,null,{body:'Sí, el casado vegano.'});assert.equal(a1.isOwner,false,'community answer');
const a2=await answer(owner,null,{body:'Sí: casado vegano y ensaladas.',authorName:'Soda Uno'});assert.equal(a2.isOwner,true,'owner answer marked');
const a3=await answer(owner,member,{body:'También hay opción sin gluten.',authorName:'Soda Uno'});assert.equal(a3.isOwner,true,'manager of the Pro team answers as the business');
await assert.rejects(()=>answer(owner,reader),hint('dir_tool_role'),'member role lacks listing.publish');
await assert.rejects(()=>answer(beto,carla),hint('dir_tool_not_manager'),'a member of nobody cannot speak for someone else');
for(const bad of [{body:''},{body:'x'.repeat(501)},{body:'https://x.cr'}])await assert.rejects(()=>answer(carla,null,bad),code('22023'),JSON.stringify(bad));
await answer(carla,null);await answer(carla,null);await answer(carla,null);
await assert.rejects(()=>answer(carla,null),hint('dir_qa_cap','54000'),'3 answers per person per question');
// daily question cap (5)
for(let i=0;i<4;i++)await ask(beto,{body:'Pregunta número '+i+' de prueba'});
await assert.rejects(()=>ask(beto,{body:'Pregunta seis de prueba'}),hint('dir_qa_cap','54000'),'5 questions a day');

// public reader: business answers first, no ids of people
const pub=(await q("select dir_place_questions_public('lugar-1') p"))[0].p;
const item=pub.items.find(i=>i.id===q1in.questionId);assert.equal(item.body,'¿Tienen opciones veganas?');
assert.deepEqual(item.answers.map(a=>a.isOwner),[true,true,false,false,false,false],'business answers first');
assert.ok(!JSON.stringify(pub).includes(ana)&&!JSON.stringify(pub).includes(owner),'no author ids');

// flags + moderation
const flag=(actor,over={})=>call('dir_qa_flag_create',actor,{flagId:uuid(),targetKind:'answer',targetId:a1.answerId,reason:'spam',...over});
await assert.rejects(()=>flag(beto),hint('dir_flag_own_review'),'own text');
assert.deepEqual(await flag(ana),{ok:true});assert.deepEqual(await flag(ana),{ok:true},'repeat answers ok');
await assert.rejects(()=>flag(ana,{reason:'other'}),code('22023'),'other needs a message');
assert.equal((await q("select count(*)::int n from dir_qa_flags where target_id=$1",[a1.answerId]))[0].n,1,'one flag per person');
const queue=(await q("select dir_admin_qa_queue('flagged',50) x"))[0].x;assert.equal(queue.length,1);assert.equal(queue[0].targetId,a1.answerId);assert.equal(queue[0].flags.length,1);
const mod=(actor,over={})=>call('dir_admin_qa_moderate',actor,{actionId:uuid(),targetKind:'answer',targetId:a1.answerId,decision:'hide',reason:'Publicidad',expectedStatus:'published',...over});
await assert.rejects(()=>mod(admin,{reason:''}),code('22023'),'reason required');
await assert.rejects(()=>mod(beto),hint('dir_review_self_moderation'),'no self-moderation');
await assert.rejects(()=>mod(admin,{expectedStatus:'hidden'}),code('40001'),'CAS');
const mIn={actionId:uuid(),targetKind:'answer',targetId:a1.answerId,decision:'hide',reason:'Publicidad',expectedStatus:'published'};
assert.equal((await call('dir_admin_qa_moderate',admin,mIn)).status,'hidden');assert.equal((await call('dir_admin_qa_moderate',admin,mIn)).status,'hidden','idempotent');
assert.equal((await q("select status from dir_qa_flags where target_id=$1",[a1.answerId]))[0].status,'upheld','flag closed');
assert.equal((await q("select dir_place_questions_public('lugar-1') p"))[0].p.items.find(i=>i.id===q1in.questionId).answers.length,5,'hidden answer gone');
assert.equal((await mod(admin,{decision:'restore',reason:'Revisado: no es publicidad',expectedStatus:'hidden'})).status,'published');
const qh=await call('dir_admin_qa_moderate',admin,{actionId:uuid(),targetKind:'question',targetId:q1in.questionId,decision:'hide',reason:'Datos personales',expectedStatus:'published'});assert.equal(qh.status,'hidden');
assert.equal((await q("select dir_place_questions_public('lugar-1') p"))[0].p.items.some(i=>i.id===q1in.questionId),false,'hidden question gone');
await assert.rejects(()=>answer(beto,null),code('P0002'),'no answers to a hidden question');
assert.deepEqual((await q("select kind,decision from dir_moderation_log order by id")).map(r=>r.kind+':'+r.decision),['answer:hide','answer:restore','question:hide'],'immutable trail');
// never edited, never deleted
await db.exec('reset role');
await assert.rejects(()=>db.query("update dir_questions set body='Otra cosa distinta'"),code('23514'));
await assert.rejects(()=>db.query("update dir_answers set status='hidden',moderation_reason='x y z'"),code('42501'),'moderation only through the function');
await assert.rejects(()=>db.query("delete from dir_answers"),code('23514'));
await assert.rejects(()=>db.query("update dir_moderation_log set reason='x'"),code('23514'));
await db.exec('set role service_role');
await denied(['dir_questions','dir_answers','dir_qa_flags'],["dir_place_questions_public('lugar-1')","dir_question_ask(null,'{}'::jsonb)","dir_admin_qa_moderate(null,'{}'::jsonb)"]);
console.log('PASS: questions & answers (sign-in, business answers marked/first, team role, caps, flags, staff moderation with CAS + log, RLS/anon denial)');
