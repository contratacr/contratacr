import {test,expect,type BrowserContext} from 'playwright/test';
import {createHash} from 'node:crypto';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {proMoney} from '../../src/lib/pro/money';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// Row 53: vendor portal. Single-use random invitation link (only its keyed hash stored), expiry,
// revocation, vendor-only view (no internal costs, other offers or the owner's notes) and offers
// sent until the bid closes. One session cookie per link. Nothing is e-mailed: the owner copies
// the link. The dev server needs PRO_BID_PORTAL_SECRET (scripts/dev-local-test-env.js provides an
// ephemeral one per process when no env source defines it).
const origin='http://127.0.0.1:3185',api='/api/pro/bids',links='/api/pro/bid-portal-links',portal='/api/pro/bid-portal';
const sha=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
const cookieName=(linkId:string)=>'ccr_bid_portal_'+linkId.replace(/-/g,'');
const shiftDay=(iso:string,days:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();}
type PortalView={revision:number;vendor:string;business:string|null;package:{code:string;status:string;lines:Array<{id:string;description:string;quantity:number;unit:string}>};offer:null|{prices:Array<{lineId:string;unitCents:number;totalCents:number}>};submissions:number};

for(const language of ['es','en'] as const)test(`Bid questions: vendor asks, owner answers once, private to the invitation, closed with the bid [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(360000);expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const en=language==='en',db=regressionAdminClient(),owner=await createDisposableAccount({prefix:'bid-questions'}),errors=collectPageErrors(page);
 const mobile=(page.viewportSize()?.width??1366)<1024,suffix=`${language}${mobile?'-mobile':''}`;let vendorContext:BrowserContext|undefined,second:BrowserContext|undefined;
 try{
  const user=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Constructora Preguntas Local',slug:'bid-questions-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
  const workId=crypto.randomUUID(),clientId='bid-questions-'+owner.id.slice(0,8),today=crTodayISO(),document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente portal',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId,client:'Cliente portal',service:'Remodelación de cocina',stage:'scheduled',start:today+'T09:00:00-06:00',end:today+'T10:00:00-06:00',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(page.context(),owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
  expect((await page.request.get('/api/pro/client-operations?'+new URLSearchParams({workId,clientId}),{timeout:45000})).status()).toBe(200);
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const bid=async(data:Record<string,unknown>)=>{const r=await page.request.post(api,{headers,data});expect(r.status(),JSON.stringify(data).slice(0,200)).toBe(200);return (await r.json()).package as {id:string;revision:number;lines:Array<{id:string}>};};
  const vendor=async(name:string)=>{const id=crypto.randomUUID();expect((await page.request.post('/api/pro/company-vendors',{headers,data:{action:'create',actionId:crypto.randomUUID(),id,name,kind:'supplier',trade:null,contactName:null,email:'',phone:'',identification:'',notes:null}})).status()).toBe(200);return id;};
  const v1=await vendor('Ferretería Central'),v2=await vendor('Maderas del Valle');
  const packageId=crypto.randomUUID(),l1=crypto.randomUUID(),l2=crypto.randomUUID();
  let pkg=await bid({action:'create',actionId:crypto.randomUUID(),workId,id:packageId,title:'Muebles de cocina',scope:'Fabricación e instalación.',dueDate:shiftDay(today,7),lines:[{id:l1,description:'Módulo inferior',quantity:2.5,unit:'m',budgetCodeId:null},{id:l2,description:'Sobre de granito',quantity:3,unit:'m²',budgetCodeId:null}]});
  pkg=await bid({action:'invite',actionId:crypto.randomUUID(),workId,id:packageId,revision:pkg.revision,supplierIds:[v1,v2]});
  pkg=await bid({action:'open',actionId:crypto.randomUUID(),workId,id:packageId,revision:pkg.revision});
  const ownerPost=(data:Record<string,unknown>)=>page.request.post(links,{headers,data});
  const ownerGet=(query:Record<string,string>)=>page.request.get(links+'?'+new URLSearchParams(query),{headers});
  // One invitation link per vendor; each vendor is a separate browser without an account.
  const makeLink=async(supplierId:string)=>{
   const r=await ownerPost({action:'create_link',actionId:crypto.randomUUID(),id:crypto.randomUUID(),workId,packageId,supplierId,replacesLinkId:null,expiresInDays:7});
   expect(r.status()).toBe(200);const body=await r.json();return {id:body.link.id as string,token:body.token as string};
  };
  const claim=async(ctx:BrowserContext,token:string)=>{const r=await ctx.request.post(origin+portal,{headers:{Origin:origin},data:{action:'claim',token}});expect(r.status()).toBe(200);return (await r.json()).link as string;};
  const a=await makeLink(v1),b=await makeLink(v2);
  vendorContext=await browser.newContext({locale:en?'en-US':'es-CR'});second=await browser.newContext({locale:en?'en-US':'es-CR'});
  await stabilizeLocalProRuntime(vendorContext,origin);await stabilizeLocalProRuntime(second,origin);
  const linkA=await claim(vendorContext,a.token),linkB=await claim(second,b.token);
  const ask=(ctx:BrowserContext,link:string,data:Record<string,unknown>,headersExtra:Record<string,string>={})=>ctx.request.post(origin+portal+'/questions',{headers:{Origin:origin,...headersExtra},data:{link,...data}});

  // ---- Vendor API: validation ----
  expect((await ask(vendorContext,linkA,{questionId:crypto.randomUUID(),text:''})).status()).toBe(400);
  expect((await ask(vendorContext,linkA,{questionId:crypto.randomUUID(),text:'x'.repeat(1001)})).status()).toBe(400);
  expect((await ask(vendorContext,linkA,{questionId:crypto.randomUUID(),text:'Hola\nmundo'})).status()).toBe(400);
  expect((await ask(vendorContext,linkA,{questionId:crypto.randomUUID(),text:'Hola',extra:1})).status()).toBe(400);
  expect((await ask(vendorContext,linkA,{questionId:crypto.randomUUID(),text:'Hola'},{Origin:'http://evil.example'})).status()).toBe(403);
  expect((await second.request.post(origin+portal+'/questions',{headers:{Origin:origin},data:{link:linkA,questionId:crypto.randomUUID(),text:'Sin sesión de ese enlace'}})).status()).toBe(401);

  // ---- Vendor asks; a retried send is not duplicated ----
  const q1=crypto.randomUUID();
  const first=await ask(vendorContext,linkA,{questionId:q1,text:'¿El precio incluye la instalación?'});expect(first.status()).toBe(200);
  expect((await first.json()).question).toMatchObject({id:q1,question:'¿El precio incluye la instalación?',answer:null,answeredAt:null});
  expect((await ask(vendorContext,linkA,{questionId:q1,text:'¿El precio incluye la instalación?'})).status()).toBe(200);
  expect((await ask(vendorContext,linkA,{questionId:q1,text:'Otro texto con el mismo identificador'})).status()).toBe(400);
  expect((await db.from('pro_bid_questions').select('id').eq('owner_id',owner.id).throwOnError()).data).toHaveLength(1);
  expect((await ask(second,linkB,{questionId:q1,text:'¿El precio incluye la instalación?'})).status()).toBe(400);
  const q2=crypto.randomUUID();expect((await ask(second,linkB,{questionId:q2,text:'¿Hasta cuándo se aceptan ofertas?'})).status()).toBe(200);

  // ---- Privacy: each vendor sees only its own question ----
  const viewA=await (await vendorContext.request.get(origin+portal+'?link='+linkA)).json();
  expect(viewA.attachments.canAsk).toBe(true);expect(viewA.attachments.questions.map((q:{id:string})=>q.id)).toEqual([q1]);
  const viewB=await (await second.request.get(origin+portal+'?link='+linkB)).json();expect(viewB.attachments.questions.map((q:{id:string})=>q.id)).toEqual([q2]);
  expect(JSON.stringify(viewA)).not.toContain('¿Hasta cuándo');

  // ---- Owner reads every question and answers once ----
  expect((await ownerGet({view:'questions',workId})).status()).toBe(400);
  const owned=await (await ownerGet({view:'questions',workId,id:packageId})).json();
  expect(owned.questions.map((q:{id:string;supplierId:string})=>[q.id,q.supplierId]).sort()).toEqual([[q1,v1],[q2,v2]].sort());
  const answerA={action:'answer_question',workId,questionId:q1,answer:'Sí, incluye la instalación.'};
  expect((await ownerPost({...answerA,answer:''})).status()).toBe(400);
  expect((await ownerPost({...answerA,questionId:crypto.randomUUID()})).status()).toBe(409);
  const answered=await ownerPost(answerA);expect(answered.status()).toBe(200);expect((await answered.json()).question).toMatchObject({id:q1,answer:'Sí, incluye la instalación.'});
  expect((await ownerPost(answerA)).status()).toBe(200);
  expect((await ownerPost({...answerA,answer:'Otra respuesta distinta'})).status()).toBe(409);
  expect((await page.request.post(links,{headers:{...headers,Origin:'http://evil.example'},data:answerA})).status()).toBe(403);
  const afterA=await (await vendorContext.request.get(origin+portal+'?link='+linkA)).json();
  expect(afterA.attachments.questions[0]).toMatchObject({id:q1,answer:'Sí, incluye la instalación.'});
  expect((await (await second.request.get(origin+portal+'?link='+linkB)).json()).attachments.questions[0].answer).toBeNull();

  // ---- UI: the vendor sees the answer; the owner answers from the bid panel; touch targets and no overflow ----
  const vendorPage=await vendorContext.newPage(),vendorErrors=collectPageErrors(vendorPage);
  await vendorPage.goto(`${origin}${en?'/en':''}/licitacion-proveedor?invitacion=${linkA}`);
  const questions=vendorPage.locator('[data-bid-portal-questions]');await expect(questions).toBeVisible({timeout:60000});
  await expect(questions.locator('[data-bid-portal-answer]')).toContainText('Sí, incluye la instalación.');
  await questions.locator('[data-bid-portal-question-input]').fill('¿Cuál es el plazo de entrega?');
  for(const control of await questions.locator('input,button').all())if(await control.isVisible())expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await questions.getByRole('button',{name:en?'Send question':'Enviar pregunta'}).click();
  await expect(questions.locator('[data-bid-portal-question-notice]')).toContainText(en?'Question sent.':'Pregunta enviada.');await expect(questions.locator('[data-bid-portal-question]')).toHaveCount(2);
  await expectNoHorizontalOverflow(vendorPage);await vendorPage.screenshot({path:info.outputPath(`bid-questions-vendor-${suffix}.png`),fullPage:true});
  await login(page.context(),owner);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'bids'}));
  await page.locator('[data-bid-item="LIC-0001"]').getByRole('button').click({timeout:60000});
  const ownerPanel=page.locator('[data-bid-detail="LIC-0001"] [data-bid-owner-questions]');await expect(ownerPanel).toBeVisible({timeout:60000});
  const pending=ownerPanel.locator('[data-bid-owner-question]').filter({hasText:'¿Cuál es el plazo de entrega?'});await expect(pending).toBeVisible();
  await pending.locator('[data-bid-owner-answer-input]').fill('Diez días hábiles.');
  await pending.getByRole('button',{name:en?'Send answer':'Enviar respuesta'}).click();await expect(pending.locator('[data-bid-owner-answer]')).toContainText('Diez días hábiles.',{timeout:60000});
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`bid-questions-owner-${suffix}.png`),fullPage:true});

  // ---- Closing the bid closes questions; existing answers stay visible ----
  pkg=(await (await page.request.get(api+'?'+new URLSearchParams({view:'detail',workId,id:packageId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json()).package;
  await bid({action:'close',actionId:crypto.randomUUID(),workId,id:packageId,revision:pkg.revision});
  const late=await ask(vendorContext,linkA,{questionId:crypto.randomUUID(),text:'¿Pregunta tardía?'});expect(late.status()).toBe(409);expect((await late.json()).reason).toBe('closed');
  const closed=await (await vendorContext.request.get(origin+portal+'?link='+linkA)).json();expect(closed.attachments.canAsk).toBe(false);expect(closed.attachments.questions.length).toBe(2);
  // Nothing was e-mailed or notified.
  for(const table of ['notifications','notification_push_outbox'])expect((await db.from(table).select('id').eq('user_id',owner.id).throwOnError()).data).toEqual([]);
  expect(errors()).toEqual([]);expect(vendorErrors()).toEqual([]);
 }finally{await second?.close().catch(()=>{});await vendorContext?.close().catch(()=>{});await page.goto('about:blank').catch(()=>{});await cleanupDisposableAccount(owner);}
});
