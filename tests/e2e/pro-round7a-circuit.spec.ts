import {test,expect,type Browser,type Page} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,login,headersFor,origin,isMobile,type Owner} from './pro-round2-fixture';
import {proMoney} from '../../src/lib/pro/money';
import {estimateInput,json as estimateJson,post as estimatePost} from './pro-private-estimate-publications-fixture';

// Round 7A (2026-11-13): quote → job → customer → finances as one circuit, as the owner and as the
// linked customer, ES/EN. Disposable accounts, loopback only; nothing is e-mailed, notified, charged
// or issued. Covers: one quote flow (old «quote with link» editor redirected), sharing to the linked
// account without a code, acceptance driving the job (agreed amount, phase, next step, customer card,
// no «join» prompt), contract from the quote with a starter template, invoicing by quote lines with the
// issuer prefilled, the like-with-like result and the invitation code surviving sign-in.
const shots=process.env.ROUND7A_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const label=(language:string)=>language+randomBytes(3).toString('hex');
async function customer(browser:Browser,prefix:string,name:string){const account=await createDisposableAccount({prefix});await regressionAdminClient().from('profiles').update({full_name:name}).eq('id',account.id).throwOnError();const context=await browser.newContext({baseURL:origin});await login(context,account);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);return{account,context};}
async function invite(page:Page,f:Owner){const created=await page.request.post(origin+'/api/pro/work-client-invitations',{headers:headersFor(f.owner),data:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,invitationId:crypto.randomUUID(),expiresInDays:7}});expect(created.status(),await created.text()).toBe(200);return (await created.json()).token as string;}
const money=(cents:number,en:boolean)=>proMoney(cents/100,en);

for(const language of ['es','en'] as const)test(`Round 7A: quote → job → customer → finances circuit [${language}]`,async({page,browser},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name;
 const f=await ownerFixture(page.context(),id,document=>{document.clients[0].phone='88887777';});
 let client:Awaited<ReturnType<typeof customer>>|undefined;const late=await createDisposableAccount({prefix:'r7a-late'});
 try{
  const errors=collectPageErrors(page);
  client=await customer(browser,'r7a-client','Clienta R7A '+id);
  // Link the customer account to the job (Round 1 invitation, no e-mail).
  const token=await invite(page,f);
  const accepted=await client.context.request.post(origin+'/api/pro/project-invitation',{headers:{Origin:origin,'X-Pro-Expected-Actor':client.account.id},data:{action:'accept',actionId:crypto.randomUUID(),token}});expect(accepted.status(),await accepted.text()).toBe(200);
  const requestId=(await f.db.from('pro_appointment_requests').select('id').eq('owner_id',f.owner.id).eq('work_id',f.workId).single().throwOnError()).data!.id as string;

  // (8) New job: the next step is the quote, never «Finish job».
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId}));
  const next=page.locator('[data-work-next-step]');await expect(next).toBeVisible({timeout:90000});
  await expect(next.locator('[data-work-next-action="estimates"]')).toHaveText(en?'Open quotes':'Abrir cotizaciones');
  await expect(next.locator('[data-work-finish]')).toHaveCount(0);
  await expect(next).toContainText(en?'Prepare and share the quote with your customer, then plan the dates.':'Prepare y comparta la cotización con su cliente; después planifique las fechas.');
  await expect(page.locator('[data-work-summary-step="estimate"]')).toHaveAttribute('data-done','false',{timeout:60000});
  await next.scrollIntoViewIfNeeded();await shot(page,`r7a-next-step-${language}`,project);

  // (1) One quote flow: the old «quote with link» editor URL lands in the full editor, same customer.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'quotes',nueva:'1',cliente:f.clientId}));
  await expect(page).toHaveURL(/nuevaEstimacion=/,{timeout:60000});await expect(page).toHaveURL(new RegExp('cotizacionCliente='+encodeURIComponent(f.clientId)));
  await expect(page).not.toHaveURL(/[?&]nueva=1/);
  await expect(page.locator('[data-private-estimate-editor]')).toBeVisible({timeout:90000});

  // The quote of the job (API writer, same as the editor).
  const ctx=await estimateJson(page.context(),{view:'context',clientId:f.clientId,sourceKind:'work',sourceId:f.workId});
  const title='Cocina R7A '+id;
  const saved=await estimatePost(page.context(),f.owner,estimateInput(ctx,{title,currency:'CRC',validUntil:'2030-12-31',lines:[{id:crypto.randomUUID(),description:'Gabinetes de cocina',unit:'m',qtyMilli:4000,unitPriceCents:10000000,discountBps:0,taxBps:1300,catalogProductId:null}]}));
  expect(saved.status(),await saved.text()).toBe(200);const estimate=(await saved.json()).estimate as {id:string;totalCents:number};expect(estimate.totalCents).toBe(45200000);

  // (2) Share to the linked customer directly: no e-mail, no code.
  await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);
  const row=page.locator(`[data-sales-estimate="private_estimate:${estimate.id}"]`);await expect(row).toContainText(en?'Draft':'Borrador',{timeout:90000});
  await expect(row).not.toContainText(en?'Private draft':'Borrador privado');
  await row.getByRole('button',{name:en?'Preview':'Vista previa',exact:true}).click();
  const owner=page.locator('[data-estimate-publications]');
  await owner.getByRole('button',{name:en?'Share':'Compartir',exact:true}).click();
  const share=owner.locator('[data-estimate-share-form]');
  const recipient=share.getByLabel(en?'Sharing recipient':'Destinatario de la cotización',{exact:true});
  await expect(recipient).toHaveValue(requestId,{timeout:60000});
  await expect(recipient.locator('option:checked')).toHaveText((en?'Linked customer account: ':'Cuenta vinculada al proyecto: ')+'Clienta R7A '+id+(en?' (no code)':' (sin código)'));
  await expect(share.locator('[data-estimate-share-linked]')).toContainText(en?'No code is needed.':'No hace falta código.');
  await expect(share.getByLabel(en?'Customer email':'Correo del cliente',{exact:true})).toHaveCount(0);
  await expectNoHorizontalOverflow(page);await share.scrollIntoViewIfNeeded();await shot(page,`r7a-share-linked-${language}`,project);
  await share.getByRole('button',{name:en?'Share version':'Compartir versión',exact:true}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:en?'Share version':'Compartir versión',exact:true}).click();
  await expect(owner.locator('[data-estimate-publication]').first()).toContainText(en?'Shared':'Compartida',{timeout:90000});
  await expect(page.locator('[data-estimate-access-code]')).toHaveCount(0);
  const publicationId=(await f.db.from('pro_private_estimate_publications').select('id').eq('estimate_id',estimate.id).single().throwOnError()).data!.id as string;

  // Customer: the quote is in the project at once and opens straight to review/accept.
  const clientPage=await client.context.newPage();const clientErrors=collectPageErrors(clientPage);
  await gotoOK(clientPage,`/${language}/dashboard/profesional?tab=sent_projects&mode=use`);
  await clientPage.locator(`[data-client-project-link="${requestId}"]`).click({timeout:90000});await expect(clientPage).toHaveURL(new RegExp(`citaSolicitud=${requestId}`),{timeout:60000});
  const quotes=clientPage.locator('[data-client-project-quotes]');await expect(quotes).toBeVisible({timeout:90000});
  const item=quotes.locator(`[data-client-project-quote="${publicationId}"]`);await expect(item).toHaveAttribute('data-status','shared');
  await expect(item).toContainText(title);await expect(item).toContainText(money(45200000,en));await expect(item).toContainText(en?'Waiting for your answer':'Pendiente de su respuesta');
  await expectNoHorizontalOverflow(clientPage);await quotes.scrollIntoViewIfNeeded();await shot(clientPage,`r7a-client-project-quotes-${language}`,project);
  await item.getByRole('button',{name:en?'Review and answer':'Revisar y responder',exact:true}).click();
  await expect(clientPage).toHaveURL(new RegExp('/dashboard/cotizaciones#publicacion='+publicationId),{timeout:60000});
  const detail=clientPage.locator('[data-estimate-publication-detail]');await expect(detail).toBeVisible({timeout:90000});await expect(detail).toContainText(title);
  await detail.getByRole('button',{name:en?'Accept quote':'Aceptar cotización',exact:true}).click();
  await clientPage.getByRole('dialog').last().getByRole('button',{name:en?'Accept quote':'Aceptar cotización',exact:true}).click();
  await expect(detail).toContainText(en?'Accepted':'Aceptada',{timeout:90000});
  // (3/8) Already linked: no «join the job» prompt, only «open the job».
  const consent=clientPage.locator('[data-project-link-consent]');await expect(consent).toBeVisible({timeout:60000});
  await expect(consent.locator('[data-project-link-consent-check]')).toHaveCount(0);await expect(consent).toContainText(en?'You joined this job.':'Ya se unió a este trabajo.');
  await consent.scrollIntoViewIfNeeded();await shot(clientPage,`r7a-client-accepted-${language}`,project);

  // (3) Acceptance drives the job: agreed amount, phase, next step, customer card, lead/billing lines.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId}));
  const overview=page.locator('[data-work-overview]');await expect(overview).toBeVisible({timeout:90000});
  const finance=overview.locator('[data-work-overview-widget="finance"]');
  await expect(finance).toContainText(money(45200000,en)+(en?' (VAT included)':' (IVA incluido)'),{timeout:60000});
  await expect(finance.locator('[data-work-overview-agreed-net]')).toHaveText(money(40000000,en));
  // (7) Like with like: agreed before VAT − costs, clearly labelled.
  await expect(finance.locator('[data-work-overview-result]')).toHaveText(money(40000000,en));
  await expect(finance).toContainText(en?'Result (before VAT)':'Resultado (sin IVA)');
  await expect(finance.locator('[data-work-overview-result-basis]')).toHaveText(en?'Agreed before VAT minus recorded costs.':'Acordado sin IVA menos costos registrados.');
  await expect(page.locator('[data-work-summary-step="estimate"]')).toHaveAttribute('data-done','true');
  await expect(page.locator('[data-work-summary-step="estimate"]')).toContainText(en?'Quote accepted':'Cotización aceptada');
  await expect(page.locator('[data-work-stage]').first()).toHaveText(en?'Quote accepted':'Cotización aceptada');
  await expectNoHorizontalOverflow(page);await finance.scrollIntoViewIfNeeded();await shot(page,`r7a-overview-accepted-${language}`,project);
  // Customer card: the job shows the derived phase and the quote its commercial status.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_clients',cliente:f.clientId}));
  await expect(page.locator(`[data-work-phase="estimate_accepted"]`).first()).toHaveText(en?'Quote accepted':'Cotización aceptada',{timeout:90000});
  await expect(page.locator(`[data-related-estimate-status="accepted"]`).first()).toHaveText(en?'Accepted':'Aceptada',{timeout:90000});
  await page.locator('[data-work-phase="estimate_accepted"]').first().scrollIntoViewIfNeeded();await shot(page,`r7a-customer-card-${language}`,project);

  // (5) Contract from the accepted quote with a ContrataCR starter template.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'estimates'}));
  const quoteRow=page.locator(`[data-project-estimate="${estimate.id}"]`);await expect(quoteRow).toHaveAttribute('data-project-estimate-status','accepted',{timeout:90000});
  await quoteRow.locator('[data-project-estimate-contract]').click();
  const create=page.locator('[data-contract-create]');await expect(create).toBeVisible({timeout:90000});
  await expect(create.locator('[data-contract-field="estimate"]')).toHaveValue(estimate.id);
  await create.locator('[data-contract-field="template"]').selectOption('starter:renovation');
  await expect(create.locator('[data-contract-starter-help]')).toBeVisible();
  await expectNoHorizontalOverflow(page);await create.scrollIntoViewIfNeeded();await shot(page,`r7a-contract-starter-${language}`,project);
  await create.getByRole('button',{name:en?'Create contract':'Crear contrato',exact:true}).click();
  await expect(create).toHaveCount(0,{timeout:90000});
  const contract=(await f.db.from('pro_contracts').select('id,estimate_id,clauses,deposit_percent,title').eq('owner_id',f.owner.id).eq('work_id',f.workId).single().throwOnError()).data!;
  expect(contract.estimate_id).toBe(estimate.id);expect((contract.clauses as unknown[]).length).toBe(7);expect(Number(contract.deposit_percent)).toBe(30);
  expect(contract.title).toBe(en?'Renovation agreement':'Contrato de remodelación');
  const read=await page.request.get(origin+'/api/pro/contracts?'+new URLSearchParams({workId:f.workId,contractId:contract.id}),{headers:headersFor(f.owner)});expect(read.status()).toBe(200);
  const preview=(await read.json()).preview;expect(preview.missingFields).toEqual([]);expect(JSON.stringify(preview)).toContain('Cliente ronda '+id);expect(JSON.stringify(preview)).toContain('Remodelaciones '+id);
  await shot(page,`r7a-contract-editor-${language}`,project);

  // (6) Invoice by quote lines: quantity → share; issuer prefilled from the company; phone formatted.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'costs'}));
  await page.locator('[data-work-billing-open]').first().click({timeout:90000});
  const lines=page.locator('[data-work-billing-lines]');await expect(lines).toBeVisible({timeout:90000});
  await lines.locator('[data-work-billing-line] input[type="checkbox"]').first().check();
  await lines.locator('[data-work-billing-qty]').first().fill('2');
  await expect(lines.locator('[data-work-billing-line]').first()).toContainText('= '+money(22600000,en));
  await expectNoHorizontalOverflow(page);await lines.scrollIntoViewIfNeeded();await shot(page,`r7a-billing-lines-${language}`,project);
  await page.getByRole('button',{name:en?'Create invoice draft':'Crear borrador de factura',exact:true}).click();
  await expect.poll(async()=>(await f.db.from('pro_invoice_billing_items').select('amount_cents').eq('user_id',f.owner.id).eq('work_id',f.workId)).data?.length??0,{timeout:90000}).toBe(1);
  const item2=(await f.db.from('pro_invoice_billing_items').select('draft_id,amount_cents,percent_bps').eq('user_id',f.owner.id).eq('work_id',f.workId).single().throwOnError()).data!;
  expect(item2.amount_cents).toBe(22600000);expect(item2.percent_bps).toBe(5000);
  const prep=(await f.db.from('pro_invoice_preparation').select('issuer_name').eq('user_id',f.owner.id).eq('draft_id',item2.draft_id).single().throwOnError()).data!;expect(prep.issuer_name).toBe('Remodelaciones '+id);
  // The progress-of-agreed path is not offered on a line-billed job (no double billing).
  const sources=await page.request.get(origin+'/api/pro/work-billing?'+new URLSearchParams({workId:f.workId}));expect(sources.status()).toBe(200);const src=await sources.json();
  expect(src.agreement??null).toBeNull();expect(src.lines[0].billedBps).toBe(5000);

  // (4) Invitation code survives sign-in (fragment only, never in the query string).
  const token2=await (async()=>{const other=await f.db.from('pro_work').insert({user_id:f.owner.id,id:crypto.randomUUID(),client:'Cliente ronda '+id,service:'Baño R7A '+id,stage:'new',start:'',end:'',clientId:f.clientId,cancelled:false}).select('id').single();expect(other.error).toBeNull();
   const created=await page.request.post(origin+'/api/pro/work-client-invitations',{headers:headersFor(f.owner),data:{action:'create',actionId:crypto.randomUUID(),workId:other.data!.id,invitationId:crypto.randomUUID(),expiresInDays:7}});expect(created.status(),await created.text()).toBe(200);return (await created.json()).token as string;})();
  const anon=await browser.newContext({baseURL:origin,...(isMobile(page)?{viewport:page.viewportSize()!}:{})});
  try{
   const visitor=await anon.newPage();const seen:string[]=[];visitor.on('request',request=>seen.push(request.url()));
   await visitor.goto(`/${language}/dashboard/unirse-proyecto#codigo=${token2}`);
   await expect(visitor).toHaveURL(/\/login\?/,{timeout:90000});
   expect(seen.every(url=>!url.includes(token2))).toBe(true);
   await login(anon,late);
   await visitor.goto(`/${language}/dashboard/unirse-proyecto?postLogin=1`);
   const codeField=visitor.locator('[data-project-invitation-code]');await expect(codeField).toHaveValue(token2,{timeout:90000});
   await expect(visitor.locator('[data-project-invitation-preview]')).toBeVisible({timeout:60000});
   expect(seen.every(url=>!url.includes(token2))).toBe(true);
   expect(await visitor.evaluate(()=>sessionStorage.getItem('ccr:project-invite-code'))).toBeNull();
   await shot(visitor,`r7a-invite-after-login-${language}`,project);
  }finally{await anon.close();}

  expect(errors()).toEqual([]);expect(clientErrors()).toEqual([]);
 }finally{
  await client?.context.close();if(client)await cleanupDisposableAccount(client.account);await cleanupDisposableAccount(late);await f.cleanup();
 }
});
