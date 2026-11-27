import {test,expect} from 'playwright/test';
import {collectPageErrors,gotoOK} from './helpers';
import {local,login,origin,ownerFixture} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {claimByEmail,dirDb,hideSeededPlaces,label,postJson,seedPlace,uid} from './pro-dir-fixture';
import {randomIp} from './pro-dir-features-fixture';

// Place features round (LOCAL Pro, 2026-11-17): questions & answers of a place. 210e1e379 (2026-11-27, owner) removed the
// «Preguntar» tab from the place page (testing-notes §6 «Quitado»); the API, the staff queue and the moderation stay, so this
// spec drives them directly: anonymous writes refused; a signed-in person asks; the business answers (first, isOwner);
// another person answers; links and own-question answers are refused; daily cap → 429; a report lands in the staff queue
// (dir_admin_qa_queue) and a staff decision hides the answer (immutable moderation log); the admin API refuses non-admins;
// the place page shows no Q&A. Owner of /api/lugar/[slug]/preguntas.
test.afterEach(()=>hideSeededPlaces());

test('Q&A API: ask, business answer first, community answer, report → staff queue, caps; no Q&A on the page',async({page,context,browser},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const db=dirDb(),tag=label(),slug=`cafe-preguntas-${tag}`;
 await seedPlace(db,{slug,vertical:'cafe_bar',name:`Café Preguntas ${tag}`,attributes:{kind:'cafe'}});
 const f=await ownerFixture(context,'qa-'+tag),errors=collectPageErrors(page);
 let asker:DisposableAccount|undefined,neighbour:DisposableAccount|undefined;
 const read=async()=>{const r=await page.request.get(`${origin}/api/lugar/${slug}/preguntas`);expect(r.status()).toBe(200);
  return await r.json() as {total:number;items:{id:string;body:string;answers:{id:string;isOwner:boolean;body:string}[]}[]};};
 try{
  await claimByEmail(context,slug);
  asker=await createDisposableAccount({prefix:'dir-qa-asker'});neighbour=await createDisposableAccount({prefix:'dir-qa-neighbour'});
  // Anonymous: empty list, writes refused; the page has no Q&A section or tab.
  const anon=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});const a=await anon.newPage();
  expect((await read()).total).toBe(0);
  const anonPost=await postJson(anon,`/api/lugar/${slug}/preguntas`,{type:'question',actionId:uid(),questionId:uid(),body:'¿Abren los domingos?'});
  expect([anonPost.status,anonPost.body?.reason]).toEqual([401,'login']);
  await gotoOK(a,`/negocios/${slug}`);
  await expect(a.locator('[data-place-tab="questions"]')).toHaveCount(0);await expect(a.locator('[data-place-questions]')).toHaveCount(0);
  await anon.close();

  // The asker asks.
  const ac=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});
  await login(ac,asker);
  const questionId=uid();
  expect((await postJson(ac,`/api/lugar/${slug}/preguntas`,{type:'question',actionId:uid(),questionId,body:'¿Tienen leche de almendras?'})).status).toBe(200);
  // Links are refused; the asker cannot answer their own question.
  expect((await postJson(ac,`/api/lugar/${slug}/preguntas`,{type:'question',actionId:uid(),questionId:uid(),body:'Vean www.otro-cafe.cr'})).status).toBe(400);
  const own=await postJson(ac,`/api/lugar/${slug}/preguntas`,{type:'answer',actionId:uid(),answerId:uid(),questionId,body:'Me respondo yo'});
  expect([own.status,own.body?.reason]).toEqual([403,'qa_own_question']);

  // A neighbour answers first, then the business: the business answer is still listed first.
  const nc=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});await login(nc,neighbour);
  const na=await postJson(nc,`/api/lugar/${slug}/preguntas`,{type:'answer',actionId:uid(),answerId:uid(),questionId,body:'Yo la pedí ayer.'});
  expect(na.status,JSON.stringify(na.body)).toBe(200);expect(na.body?.isOwner).toBe(false);
  const ba=await postJson(context,`/api/lugar/${slug}/preguntas`,{type:'answer',actionId:uid(),answerId:uid(),questionId,body:'Sí, todos los días.'});
  expect(ba.status,JSON.stringify(ba.body)).toBe(200);expect(ba.body?.isOwner).toBe(true);
  const listed=(await read()).items.find(q=>q.id===questionId)!;
  expect(listed.answers.map(x=>[x.isOwner,x.body])).toEqual([[true,'Sí, todos los días.'],[false,'Yo la pedí ayer.']]);

  // The asker reports the neighbour's answer → staff queue; staff hides it with a reason → gone, logged.
  const neighbourAnswer=String(na.body?.answerId);
  expect((await postJson(ac,`/api/lugar/${slug}/preguntas`,{type:'flag',flagId:uid(),targetKind:'answer',targetId:neighbourAnswer,reason:'offensive'})).status).toBe(200);
  const queue=(await db.rpc('dir_admin_qa_queue',{p_filter:'flagged',p_limit:200})).data as {targetId:string;flags:unknown[]}[];
  expect(queue.find(q=>q.targetId===neighbourAnswer)?.flags.length).toBe(1);
  expect((await ac.request.get(`${origin}/api/admin/directorio?queue=questions`)).status()).toBe(403);// staff only
  const staff=uid();
  const hide=await db.rpc('dir_admin_qa_moderate',{p_actor:staff,p_input:{actionId:uid(),targetKind:'answer',targetId:neighbourAnswer,decision:'hide',reason:'Lenguaje ofensivo (E2E)',expectedStatus:'published'}});
  expect(hide.error).toBeNull();
  const stale=await db.rpc('dir_admin_qa_moderate',{p_actor:staff,p_input:{actionId:uid(),targetKind:'answer',targetId:neighbourAnswer,decision:'hide',reason:'Otra vez',expectedStatus:'published'}});
  expect(stale.error?.code).toBe('40001');
  expect((await db.from('dir_moderation_log').select('kind,decision').eq('target_id',neighbourAnswer)).data).toEqual([{kind:'answer',decision:'hide'}]);
  expect((await read()).items.find(q=>q.id===questionId)!.answers.map(x=>x.isOwner)).toEqual([true]);

  // Daily cap (5 questions per person): the asker already asked 1.
  for(let i=0;i<4;i++)expect((await postJson(ac,`/api/lugar/${slug}/preguntas`,{type:'question',actionId:uid(),questionId:uid(),body:`Pregunta de prueba ${i} ${tag}`})).status).toBe(200);
  const capped=await postJson(ac,`/api/lugar/${slug}/preguntas`,{type:'question',actionId:uid(),questionId:uid(),body:'Una pregunta más'});
  expect([capped.status,capped.body?.reason]).toEqual([429,'qa_cap']);
  await ac.close();await nc.close();
  expect(errors()).toEqual([]);
 }finally{await cleanupDisposableAccount(asker);await cleanupDisposableAccount(neighbour);await f.cleanup();}
});
