import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login,origin,ownerFixture} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {openPlaceTab, claimByEmail,dirDb,hideSeededPlaces,label,postJson,seedPlace,uid} from './pro-dir-fixture';
import {randomIp} from './pro-dir-features-fixture';

// Place features round (LOCAL Pro, 2026-11-17): questions & answers on every place page. Anonymous visitors read and get a
// sign-in link; a signed-in person asks (UI); the business answers (UI, marked «Respuesta del negocio» and listed first);
// another person answers; links and own-question answers are refused; daily cap → 429; a report lands in the staff
// queue (dir_admin_qa_queue) and a staff decision hides the answer (immutable moderation log); the admin API refuses
// non-admins. Banks have Q&A too. Owner of /api/lugar/[slug]/preguntas.
test.afterEach(()=>hideSeededPlaces());

for(const language of ['es','en'] as const)test(`Q&A: ask, business answer first, community answer, report → staff queue, caps [${language}]`,async({page,context,browser},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'',db=dirDb(),tag=label(),slug=`cafe-preguntas-${tag}`;
 await seedPlace(db,{slug,vertical:'cafe_bar',name:`Café Preguntas ${tag}`,attributes:{kind:'cafe'}});
 await seedPlace(db,{slug:`banco-preguntas-${tag}`,vertical:'banking',name:`Banco Preguntas ${tag}`,attributes:{kind:'bank'}});
 const f=await ownerFixture(context,'qa-'+tag),errors=collectPageErrors(page);
 let asker:DisposableAccount|undefined,neighbour:DisposableAccount|undefined;
 try{
  await claimByEmail(context,slug);
  asker=await createDisposableAccount({prefix:'dir-qa-asker'});neighbour=await createDisposableAccount({prefix:'dir-qa-neighbour'});
  // Anonymous: empty state and a sign-in link; the API refuses writes.
  const anon=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});const a=await anon.newPage();
  await gotoOK(a,`${prefix}/lugar/${slug}`);await openPlaceTab(a,'questions');
  await expect(a.locator('[data-qa-empty]')).toContainText(t('Todavía no hay preguntas.','No questions yet.'));
  await expect(a.getByRole('link',{name:t('Inicie sesión para preguntar o responder','Sign in to ask or answer')})).toBeVisible();
  const anonPost=await postJson(anon,`/api/lugar/${slug}/preguntas`,{type:'question',actionId:uid(),questionId:uid(),body:'¿Abren los domingos?'});
  expect([anonPost.status,anonPost.body?.reason]).toEqual([401,'login']);
  await gotoOK(a,`${prefix}/lugar/banco-preguntas-${tag}`);await openPlaceTab(a,'questions');await expect(a.locator('[data-place-questions]')).toBeVisible();// every place page
  await anon.close();

  // The asker (own context) asks through the UI.
  const ac=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});const ap=await ac.newPage();
  await login(ac,asker);
  await gotoOK(ap,`${prefix}/lugar/${slug}`);await openPlaceTab(ap,'questions');
  await expect(ap.locator('[data-place-questions][data-ready]')).toBeVisible({timeout:45000});
  const question=t('¿Tienen leche de almendras?','Do you have almond milk?');
  await ap.locator('#qa-ask').fill(question);await ap.locator('[data-qa-ask-submit]').click();
  await expect(ap.locator('[data-qa-notice="ok"]')).toBeVisible();
  const item=ap.locator('[data-qa-question]').filter({hasText:question});await expect(item).toBeVisible();
  const questionId=(await item.getAttribute('data-qa-question'))!;
  // Links are refused; the asker cannot answer their own question.
  expect((await postJson(ac,`/api/lugar/${slug}/preguntas`,{type:'question',actionId:uid(),questionId:uid(),body:'Vean www.otro-cafe.cr'})).status).toBe(400);
  const own=await postJson(ac,`/api/lugar/${slug}/preguntas`,{type:'answer',actionId:uid(),answerId:uid(),questionId,body:'Me respondo yo'});
  expect([own.status,own.body?.reason]).toEqual([403,'qa_own_question']);

  // The business answers through the UI (owner context): marked and first.
  await gotoOK(page,`${prefix}/lugar/${slug}`);await openPlaceTab(page,'questions');
  await expect(page.locator('[data-place-questions][data-ready]')).toBeVisible({timeout:45000});
  await expect(page.locator('[data-qa-ask]')).toHaveCount(0);// managers answer, they do not ask
  await page.locator(`[data-qa-answer-open="${questionId}"]`).click();
  await expect(page.locator(`[data-qa-answer-open="${questionId}"]`)).toHaveText(t('Responder como el negocio','Answer as the business'));
  await page.locator(`#qa-answer-${questionId}`).fill(t('Sí, todos los días.','Yes, every day.'));
  await page.locator('[data-qa-answer-submit]').click();
  await expect(page.locator('[data-qa-notice="ok"]')).toBeVisible();
  // A neighbour answers too (API), after the business.
  const nc=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});await login(nc,neighbour);
  const na=await postJson(nc,`/api/lugar/${slug}/preguntas`,{type:'answer',actionId:uid(),answerId:uid(),questionId,body:t('Yo la pedí ayer.','I ordered it yesterday.')});
  expect(na.status,JSON.stringify(na.body)).toBe(200);expect(na.body?.isOwner).toBe(false);
  await ap.reload();await openPlaceTab(ap,'questions');
  const answers=ap.locator(`[data-qa-question="${questionId}"] [data-qa-answer]`);
  await expect(answers).toHaveCount(2);
  await expect(answers.first()).toHaveAttribute('data-qa-owner','true');
  await expect(answers.first()).toContainText(t('Respuesta del negocio','Answer from the business'));
  await expectNoHorizontalOverflow(ap);

  // The asker reports the neighbour's answer (UI) → staff queue; staff hides it with a reason → gone, logged.
  const neighbourAnswer=String(na.body?.answerId);
  await ap.locator(`[data-qa-answer="${neighbourAnswer}"] [data-qa-report="answer"]`).click();
  const form=ap.locator('[data-qa-report-form]');await form.locator('select[name="reason"]').selectOption('offensive');
  await form.getByRole('button',{name:t('Enviar reporte','Send report')}).click();
  await expect(ap.locator('[data-qa-notice="ok"]').first()).toBeVisible();
  const queue=(await db.rpc('dir_admin_qa_queue',{p_filter:'flagged',p_limit:200})).data as {targetId:string;flags:unknown[]}[];
  expect(queue.find(q=>q.targetId===neighbourAnswer)?.flags.length).toBe(1);
  expect((await ac.request.get(`${origin}/api/admin/directorio?queue=questions`)).status()).toBe(403);// staff only
  const staff=uid();
  const hide=await db.rpc('dir_admin_qa_moderate',{p_actor:staff,p_input:{actionId:uid(),targetKind:'answer',targetId:neighbourAnswer,decision:'hide',reason:'Lenguaje ofensivo (E2E)',expectedStatus:'published'}});
  expect(hide.error).toBeNull();
  const stale=await db.rpc('dir_admin_qa_moderate',{p_actor:staff,p_input:{actionId:uid(),targetKind:'answer',targetId:neighbourAnswer,decision:'hide',reason:'Otra vez',expectedStatus:'published'}});
  expect(stale.error?.code).toBe('40001');
  expect((await db.from('dir_moderation_log').select('kind,decision').eq('target_id',neighbourAnswer)).data).toEqual([{kind:'answer',decision:'hide'}]);
  await ap.reload();await openPlaceTab(ap,'questions');await expect(answers).toHaveCount(1);

  // Daily cap (5 questions per person): the asker already asked 1.
  for(let i=0;i<4;i++)expect((await postJson(ac,`/api/lugar/${slug}/preguntas`,{type:'question',actionId:uid(),questionId:uid(),body:`Pregunta de prueba ${i} ${tag}`})).status).toBe(200);
  const capped=await postJson(ac,`/api/lugar/${slug}/preguntas`,{type:'question',actionId:uid(),questionId:uid(),body:'Una pregunta más'});
  expect([capped.status,capped.body?.reason]).toEqual([429,'qa_cap']);
  await ac.close();await nc.close();
  expect(errors()).toEqual([]);
 }finally{await cleanupDisposableAccount(asker);await cleanupDisposableAccount(neighbour);await f.cleanup();}
});
