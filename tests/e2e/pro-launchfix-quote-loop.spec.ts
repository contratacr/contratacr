import {test,expect,type Browser,type Page} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,login,headersFor,origin} from './pro-round2-fixture';
import {proMoney} from '../../src/lib/pro/money';
import {estimateInput,json as estimateJson,post as estimatePost} from './pro-private-estimate-publications-fixture';

// Launch fixes after walkthrough 3 (2026-11-17), the walkthrough's own order of events:
//  B1  a quote with SECTIONS shared by e-mail + code is confirmed in the UI (no «Cambio de cotización
//      pendiente», the one-time code is shown, nothing stays blocked after reload);
//  B2  the customer is linked to the job AFTER that share; the owner shares again straight to the linked
//      account (no code) and the customer sees it in the project as pending;
//  I1  the job's next steps follow the shared quote;
//  loop the customer accepts → the job shows the agreed amount and «Quote accepted» → billing from the job
//      shows the agreed amount and the draft warns that the fiscal profile is incomplete.
// Disposable accounts, loopback only. Nothing is really e-mailed, charged or issued.
const shots=process.env.LAUNCHFIX_SHOTS_DIR;
async function shot(page:Page,name:string,project:string){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`)});}
const money=(cents:number,en:boolean)=>proMoney(cents/100,en);
const journal=(id:string)=>'ccr:pro:private-estimate-publication-write:v1:'+id;
async function customer(browser:Browser,name:string){const account=await createDisposableAccount({prefix:'lf-client'});await regressionAdminClient().from('profiles').update({full_name:name}).eq('id',account.id).throwOnError();const context=await browser.newContext({baseURL:origin});await login(context,account);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);return{account,context};}

for(const language of ['es','en'] as const)test(`Launch fix: grouped quote shared by code, then to the linked customer, accepted and billed [${language}]`,async({page,browser},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),project=info.project.name;
 const f=await ownerFixture(page.context(),id);let client:Awaited<ReturnType<typeof customer>>|undefined;
 try{
  const errors=collectPageErrors(page);
  client=await customer(browser,'Clienta Lanzamiento '+id);
  // A quote with two sections (as in the walkthrough: Demolición / Instalación) and an incomplete issuer.
  const ctx=await estimateJson(page.context(),{view:'context',clientId:f.clientId});
  const title='Cocina lanzamiento '+id;
  const lines=[{id:crypto.randomUUID(),description:'Retiro de muebles y enchape',unit:'',qtyMilli:1000,unitPriceCents:35000000,discountBps:0,taxBps:1300,catalogProductId:null,group:en?'Demolition':'Demolición'},
   {id:crypto.randomUUID(),description:'Instalación de gabinetes',unit:'',qtyMilli:1000,unitPriceCents:120000000,discountBps:0,taxBps:1300,catalogProductId:null,group:en?'Installation':'Instalación'}];
  const saved=await estimatePost(page.context(),f.owner,estimateInput(ctx,{title,currency:'CRC',validUntil:'2030-12-31',lines}));
  expect(saved.status(),await saved.text()).toBe(200);const estimate=(await saved.json()).estimate as {id:string;totalCents:number};expect(estimate.totalCents).toBe(175150000);

  // B1: share by e-mail + code. The UI confirms it, shows the code once and clears its journal.
  await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);
  const row=page.locator(`[data-sales-estimate="private_estimate:${estimate.id}"]`);await expect(row).toBeVisible({timeout:90000});
  await row.getByRole('button',{name:en?'Preview':'Vista previa',exact:true}).click();
  const owner=page.locator('[data-estimate-publications]');
  await owner.getByRole('button',{name:en?'Share':'Compartir',exact:true}).click();
  let share=owner.locator('[data-estimate-share-form]');
  await expect(share.getByLabel(en?'Sharing recipient':'Destinatario de la cotización',{exact:true})).toHaveValue('manual',{timeout:60000});
  await expect(share.locator('[data-estimate-share-issuer-incomplete]')).toBeVisible();
  await share.getByLabel(en?'Customer email':'Correo del cliente',{exact:true}).fill(client.account.email);
  await share.getByRole('button',{name:en?'Share version':'Compartir versión',exact:true}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:en?'Share version':'Compartir versión',exact:true}).click();
  const handoff=owner.locator('[data-estimate-publication-code]');
  await expect(handoff.getByLabel(en?'Access code':'Código de acceso',{exact:true})).toBeVisible({timeout:90000});
  await expect(owner.getByText(en?'Could not verify this action. Check its saved result.':'No se pudo verificar el cambio. Compruebe el resultado guardado.')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);await shot(page,`lf-b1-code-${language}`,project);
  await owner.locator('[data-estimate-publication-recovery]').getByRole('button',{name:en?'Done':'Listo',exact:true}).click();
  await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),journal(f.owner.id))).toBeNull();
  await page.reload();
  await row.getByRole('button',{name:en?/^(Review shared version|Preview)$/:/^(Revisar versión compartida|Vista previa)$/}).first().click({timeout:90000});
  await expect(page.locator('[data-estimate-publication-recovery]')).toHaveCount(0);
  await expect(page.getByText(en?'Pending quote action':'Cambio de cotización pendiente')).toHaveCount(0);
  const first=(await f.db.from('pro_private_estimate_publications').select('id,content').eq('estimate_id',estimate.id).single().throwOnError()).data!;
  expect((first.content as {lines:{group?:string}[]}).lines.map(line=>line.group)).toEqual(lines.map(line=>line.group));

  // The customer is linked to the job only now (project invitation).
  const created=await page.request.post(origin+'/api/pro/work-client-invitations',{headers:headersFor(f.owner),data:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,invitationId:crypto.randomUUID(),expiresInDays:7}});expect(created.status(),await created.text()).toBe(200);
  const accepted=await client.context.request.post(origin+'/api/pro/project-invitation',{headers:{Origin:origin,'X-Pro-Expected-Actor':client.account.id},data:{action:'accept',actionId:crypto.randomUUID(),token:(await created.json()).token}});expect(accepted.status(),await accepted.text()).toBe(200);
  const requestId=(await f.db.from('pro_appointment_requests').select('id').eq('owner_id',f.owner.id).eq('work_id',f.workId).single().throwOnError()).data!.id as string;

  // B2: share again from the draft, straight to the linked account (offered first, no code).
  await page.reload();
  await row.getByRole('button',{name:en?'View draft':'Ver borrador',exact:true}).click({timeout:90000});
  await owner.getByRole('button',{name:en?'Share':'Compartir',exact:true}).click();
  share=owner.locator('[data-estimate-share-form]');
  await expect(share.getByLabel(en?'Sharing recipient':'Destinatario de la cotización',{exact:true})).toHaveValue(requestId,{timeout:60000});
  await expect(share.locator('[data-estimate-share-linked]')).toContainText(en?'No code is needed.':'No hace falta código.');
  await expectNoHorizontalOverflow(page);await share.scrollIntoViewIfNeeded();await shot(page,`lf-b2-share-linked-${language}`,project);
  await share.getByRole('button',{name:en?'Share version':'Compartir versión',exact:true}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:en?'Share version':'Compartir versión',exact:true}).click();
  await expect(owner.getByRole('status').filter({hasText:en?'Quote updated.':'Cotización actualizada.'})).toBeVisible({timeout:90000});
  await expect(page.locator('[data-estimate-publication-recovery]')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),journal(f.owner.id))).toBeNull();
  const shared=(await f.db.from('pro_private_estimate_publications').select('id').eq('estimate_id',estimate.id).eq('version',2).single().throwOnError()).data!.id as string;
  expect((await f.db.from('pro_private_estimate_publication_states').select('status,recipient_id').eq('publication_id',shared).single().throwOnError()).data).toEqual({status:'shared',recipient_id:client.account.id});

  // I1: the job's next steps follow the shared quote.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId}));
  await expect(page.locator('[data-work-summary-step="estimate"]')).toContainText(en?'Quote shared: waiting for the customer\'s answer':'Cotización compartida: esperando la respuesta del cliente',{timeout:90000});
  await expect(page.locator('[data-work-next-step]')).toContainText(en?'Quote shared: wait for the customer\'s answer.':'Cotización compartida: espere la respuesta del cliente.');
  await shot(page,`lf-i1-next-steps-${language}`,project);

  // The linked customer sees it in the project, pending, and accepts it.
  const clientPage=await client.context.newPage();const clientErrors=collectPageErrors(clientPage);
  await gotoOK(clientPage,`/${language}/dashboard/mi-proyecto/${requestId}`);
  const quotes=clientPage.locator('[data-client-project-quotes]');await expect(quotes).toBeVisible({timeout:90000});
  const item=quotes.locator(`[data-client-project-quote="${shared}"]`);await expect(item).toHaveAttribute('data-status','shared');
  await expect(item).toContainText(title);await expect(item).toContainText(money(175150000,en));await expect(item).toContainText(en?'Waiting for your answer':'Pendiente de su respuesta');
  // The superseded code version is not offered to the customer.
  await expect(quotes.locator(`[data-client-project-quote="${first.id}"]`)).toHaveCount(0);
  await expect(clientPage.getByText(en?'Nothing is waiting for your approval':'No tiene nada pendiente por aprobar')).toHaveCount(0);
  await expectNoHorizontalOverflow(clientPage);await quotes.scrollIntoViewIfNeeded();await shot(clientPage,`lf-b2-client-pending-${language}`,project);
  await item.getByRole('button',{name:en?'Review and answer':'Revisar y responder',exact:true}).click();
  const detail=clientPage.locator('[data-estimate-publication-detail]');await expect(detail).toBeVisible({timeout:90000});await expect(detail).toContainText(title);
  await expect(detail).toContainText(en?'Demolition':'Demolición');
  await detail.getByRole('button',{name:en?'Accept quote':'Aceptar cotización',exact:true}).click();
  await clientPage.getByRole('dialog').last().getByRole('button',{name:en?'Accept quote':'Aceptar cotización',exact:true}).click();
  await expect(detail).toContainText(en?'Accepted':'Aceptada',{timeout:90000});

  // Old bug 4: acceptance reaches the job (agreed amount, step, phase) and its finances.
  await expect.poll(async()=>(await f.db.from('pro_private_estimate_work_agreements').select('total_cents').eq('owner_id',f.owner.id).eq('work_id',f.workId)).data?.[0]?.total_cents??null,{timeout:60000}).toBe(175150000);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId}));
  const finance=page.locator('[data-work-overview-widget="finance"]');
  await expect(finance).toContainText(money(175150000,en),{timeout:90000});await expect(finance).not.toContainText(en?'Not set':'Sin definir');
  await expect(page.locator('[data-work-summary-step="estimate"]')).toHaveAttribute('data-done','true');
  await expect(page.locator('[data-work-stage]').first()).toHaveText(en?'Quote accepted':'Cotización aceptada');
  await expect(page.locator('[data-work-next-step]')).toContainText(en?'Quote accepted':'Cotización aceptada');
  await finance.scrollIntoViewIfNeeded();await shot(page,`lf-loop-accepted-${language}`,project);
  // Customer file: the job phase and the quote status.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_clients',cliente:f.clientId}));
  await expect(page.locator('[data-work-phase="estimate_accepted"]').first()).toBeVisible({timeout:90000});
  await expect(page.locator('[data-related-estimate-status="accepted"]').first()).toBeVisible({timeout:90000});

  // Billing from the job: agreed amount, and the draft says the fiscal profile is incomplete.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'costs'}));
  await page.locator('[data-work-billing-open]').first().click({timeout:90000});
  await expect(page.locator('[data-work-billing-agreed]')).toHaveText(money(175150000,en),{timeout:90000});
  const billing=page.locator('[data-work-billing-lines]');await billing.locator('[data-work-billing-line] input[type="checkbox"]').first().check();
  await page.getByRole('button',{name:en?'Create invoice draft':'Crear borrador de factura',exact:true}).click();
  const warning=page.locator('[data-invoice-issuer-incomplete]').first();
  await expect(warning).toBeVisible({timeout:90000});await expect(warning).toContainText(en?'Incomplete fiscal profile.':'Perfil fiscal incompleto.');
  await expectNoHorizontalOverflow(page);await warning.scrollIntoViewIfNeeded();await shot(page,`lf-invoice-issuer-warning-${language}`,project);

  expect(errors()).toEqual([]);expect(clientErrors()).toEqual([]);
 }finally{
  await client?.context.close();if(client)await cleanupDisposableAccount(client.account);await f.cleanup();
 }
});
