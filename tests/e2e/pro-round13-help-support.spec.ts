import {test,expect} from 'playwright/test';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';

// Round 13 (row 74): help center with search, training lessons with saved progress and Pro support on the platform's
// own ticket thread (topic "pro", priority, first-response TARGET). Disposable accounts, loopback only; no email goes out.
for(const language of ['es','en'] as const)test(`Round 13: help center, training and Pro support [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',label=language+crypto.randomUUID().slice(0,6),t=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),label);
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner),url=(view:string)=>`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:view});
  // (1) Help center: every guide is listed, the search narrows it and an empty search offers support.
  await gotoOK(page,url('ayuda'));
  const help=page.locator('[data-help-center]');await expect(help).toBeVisible({timeout:90000});
  const all=await help.locator('[data-help-article]').count();expect(all).toBeGreaterThanOrEqual(12);
  await help.getByRole('searchbox').fill(t('cotización','quote'));
  await expect(help.locator('[data-help-article="first_quote"]')).toBeVisible();expect(await help.locator('[data-help-article]').count()).toBeLessThan(all);
  await help.getByRole('searchbox').fill('zzzz-sin-resultado');await expect(help.locator('[data-help-empty]')).toBeVisible();
  await help.getByRole('searchbox').fill(t('plan de pagos','payment plan'));
  await help.locator('[data-help-article="invoices"]').getByRole('button').first().click();
  await expect(help.locator('[data-help-article="invoices"]')).toContainText(t('plan de pagos sin intereses','interest-free payment plan'));
  await expectNoHorizontalOverflow(page);
  // (2) Training: progress is stored per account and survives a reload; unmarking removes it.
  await gotoOK(page,url('formacion'));
  const training=page.locator('[data-training]');await expect(training).toBeVisible({timeout:90000});
  await training.locator('[data-lesson="l_first_quote"]').getByRole('button',{name:t('Marcar como completada','Mark as completed')}).click();
  await expect(training.locator('[data-lesson="l_first_quote"]')).toHaveAttribute('data-done','true',{timeout:30000});
  expect((await f.db.from('pro_training_progress').select('lesson_key').eq('owner_id',f.owner.id)).data).toEqual([{lesson_key:'l_first_quote'}]);
  await page.reload();await expect(page.locator('[data-lesson="l_first_quote"]')).toHaveAttribute('data-done','true',{timeout:90000});
  expect((await page.request.post(origin+'/api/pro/company-training',{headers:h,data:{lessonKey:'no_existe',completed:true}})).status()).toBe(400);
  expect((await page.request.post(origin+'/api/pro/company-training',{headers:{Origin:'https://evil.test'},data:{lessonKey:'l_team',completed:true}})).status()).toBe(403);
  await page.locator('[data-lesson="l_first_quote"]').getByRole('button',{name:t('Marcar como pendiente','Mark as to do')}).click();
  await expect(page.locator('[data-lesson="l_first_quote"]')).toHaveAttribute('data-done','false',{timeout:30000});
  expect((await f.db.from('pro_training_progress').select('lesson_key').eq('owner_id',f.owner.id)).data).toEqual([]);
  // (3) Pro support: ticket in the shared support table, target shown as a target, team answer closes the target.
  await gotoOK(page,url('soporte'));
  const support=page.locator('[data-pro-support]');await expect(support).toBeVisible({timeout:90000});
  await expect(support.locator('[data-sla-target]')).toContainText(t('no una garantía','not a guarantee'));
  await support.getByLabel(t('Asunto','Subject')).fill(t('No me carga la cotización','My quote does not load'));
  await support.getByLabel(t('Prioridad','Priority')).selectOption('urgent');
  await support.getByLabel(t('Mensaje','Message')).fill(t('Al abrirla veo una pantalla en blanco.','I see a blank screen when I open it.'));
  await support.getByRole('button',{name:t('Enviar consulta','Send request')}).click();
  await expect(support.locator('[data-support-notice]')).toBeVisible({timeout:30000});
  const ticket=(await f.db.from('support_tickets').select('id,topic,pro_priority,subject,first_response_due_at,created_at,case_number').eq('user_id',f.owner.id).single()).data!;
  expect(ticket).toMatchObject({topic:'pro',pro_priority:'urgent'});expect(ticket.subject).toContain('[Pro urgente]');
  expect(new Date(ticket.first_response_due_at).getTime()-new Date(ticket.created_at).getTime()).toBeGreaterThan(3.9*3600e3);
  expect(new Date(ticket.first_response_due_at).getTime()-new Date(ticket.created_at).getTime()).toBeLessThan(4.1*3600e3);
  const row=support.locator(`[data-support-ticket="${ticket.id}"]`);await expect(row).toHaveAttribute('data-sla','pending',{timeout:30000});
  // A team answer (inserted as the admin panel does) turns the target into "met" and shows in the thread.
  await f.db.from('support_ticket_messages').insert({ticket_id:ticket.id,sender_role:'admin',sender_name:'Soporte ContrataCR',body:t('Ya lo revisamos, intente de nuevo.','We checked it, please try again.')}).throwOnError();
  await page.reload();await expect(page.locator(`[data-support-ticket="${ticket.id}"]`)).toHaveAttribute('data-sla','met',{timeout:90000});
  await page.locator(`[data-support-ticket="${ticket.id}"]`).getByRole('button').first().click();
  await expect(page.locator('[data-support-thread]')).toContainText(t('Ya lo revisamos','We checked it'),{timeout:30000});
  await page.locator('[data-support-thread]').getByLabel(t('Responder','Reply')).fill(t('Gracias, ya funciona.','Thanks, it works now.'));
  await page.locator('[data-support-thread]').getByRole('button',{name:t('Enviar respuesta','Send reply')}).click();
  await expect(page.locator('[data-support-thread]')).toContainText(t('Gracias, ya funciona.','Thanks, it works now.'),{timeout:30000});
  await expectNoHorizontalOverflow(page);
  // Validation and the open-ticket cap.
  expect((await page.request.post(origin+'/api/pro/company-support',{headers:h,data:{subject:'x',message:'hola',priority:'normal'}})).status()).toBe(400);
  expect((await page.request.post(origin+'/api/pro/company-support',{headers:h,data:{subject:'Asunto válido',message:'Mensaje válido',priority:'high'}})).status()).toBe(400);
  expect(errors).toEqual([]);
 }finally{await f.cleanup();}
});
