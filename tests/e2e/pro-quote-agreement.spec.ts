import {test,expect,type BrowserContext} from 'playwright/test';
import {randomBytes,createHash} from 'node:crypto';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {acceptanceResultSchema,lineResponseSchema} from '../../src/lib/pro/quote-recorded-acceptance';

// Rows 35 and 39 (2026-11-23), API level: (a) the customer's per-line approval becomes the FORMAL partial response of the shared
// version (needs every line decided, customer only, once, freezes the decisions) and the owner converts it directly into the agreement
// of a job; (b) the owner records an acceptance that happened outside the platform (who, when, how, evidence) and the quote becomes
// the agreement. Guards: evidence required, no future dates, replay, a second agreement refused, CRC only. Disposable accounts, loopback only.
const quoteApi='/api/pro/quote-acceptance',responseApi='/api/pro/quote-line-response',decideApi='/api/pro/quote-line-decisions';
test('Quote agreement: formal partial response, direct conversion and acceptance recorded outside',async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const id='qa'+randomBytes(3).toString('hex');
 const f=await ownerFixture(page.context(),id);let customer:DisposableAccount|null=null;const contexts:BrowserContext[]=[];
 try{
  const owner=f.owner.id,oh={Origin:origin,'X-Pro-Expected-Actor':owner};
  const cc=await browser.newContext({baseURL:origin});contexts.push(cc);customer=await createDisposableAccount({prefix:'qa-cust'});await login(cc,customer);
  const token='qa-'+id,hash=createHash('sha256').update('ccr-work-invite:v1:'+token).digest('hex');
  expect((await f.db.rpc('pro_work_client_invitations_mutate',{p_actor:owner,p_input:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,invitationId:crypto.randomUUID(),tokenHash:hash,expiresInDays:7}})).error).toBeNull();
  expect((await f.db.rpc('pro_work_client_invitation_accept',{p_actor:customer.id,p_input:{action:'accept',actionId:crypto.randomUUID(),tokenHash:hash}})).error).toBeNull();
  const requestId=(await f.db.from('pro_appointment_requests').select('id').eq('owner_id',owner).eq('client_user_id',customer.id).single()).data!.id as string;
  const ctx=(await f.db.rpc('pro_private_estimate_context',{p_actor:owner,p_client:null,p_kind:'work',p_id:f.workId})).data as {client:{id:string};clientFingerprint:string;source:unknown;issuer:Record<string,unknown>};
  const save=async(estimateId:string,title:string,currency:string,lines:string[])=>(await f.db.rpc('pro_private_estimate_mutate',{p_actor:owner,p_input:{action:'save',actionId:crypto.randomUUID(),estimateId,revision:0,clientId:ctx.client.id,refreshClient:false,clientFingerprint:ctx.clientFingerprint,source:ctx.source,issuer:{...ctx.issuer,issuerName:'Constructora QA'},title,notes:'',currency,validUntil:null,
   lines:lines.map((lineId,i)=>({id:lineId,description:'Partida '+(i+1),unit:'unid.',qtyMilli:1000,unitPriceCents:(i+1)*10000000,discountBps:0,taxBps:1300,catalogProductId:null,unitCostCents:1000000}))}})).error;

  // ---- (a) Formal partial response of a shared version ----
  const est=crypto.randomUUID(),l1=crypto.randomUUID(),l2=crypto.randomUUID(),pub=crypto.randomUUID();
  expect(await save(est,'Baño '+id,'CRC',[l1,l2])).toBeNull();
  const publish={action:'publish',actionId:crypto.randomUUID(),estimateId:est,estimateRevision:1,publicationId:pub,recipient:{kind:'linked',requestId,recipientId:customer.id}};
  expect((await f.db.rpc('pro_private_estimate_publication_mutate',{p_actor:owner,p_input:publish,p_input_hash:createHash('sha256').update(JSON.stringify(publish)).digest('hex'),p_verified_email:null})).error).toBeNull();
  const decide=(line:string,decision:string,revision:number)=>cc.request.post(origin+decideApi,{headers:{Origin:origin},data:{actionId:crypto.randomUUID(),publicationId:pub,lineId:line,decision,note:'',revision}});
  const respond=(data:Record<string,unknown>,ctxReq=cc.request,headers:Record<string,string>={Origin:origin})=>ctxReq.post(origin+responseApi,{headers,data});
  // Nothing decided yet: the response is refused; the owner cannot answer for the customer.
  expect((await respond({actionId:crypto.randomUUID(),publicationId:pub,note:''})).status()).toBe(400);
  expect((await respond({actionId:crypto.randomUUID(),publicationId:pub,note:''},page.request,oh)).status()).toBeGreaterThanOrEqual(400);
  expect((await decide(l1,'approved',0)).status()).toBe(200);
  expect((await respond({actionId:crypto.randomUUID(),publicationId:pub,note:''})).status()).toBe(400);// one line still undecided
  expect((await decide(l2,'declined',0)).status()).toBe(200);
  const body={actionId:crypto.randomUUID(),publicationId:pub,note:'Solo la primera'};
  const sent=await respond(body);expect(sent.status(),await sent.text()).toBe(200);const response=lineResponseSchema.parse((await sent.json()).response);
  expect(response.approvedLineIds).toEqual([l1]);expect(response.declinedLineIds).toEqual([l2]);
  expect(lineResponseSchema.parse((await (await respond(body)).json()).response).contentHash).toBe(response.contentHash);// replay
  expect((await respond({actionId:crypto.randomUUID(),publicationId:pub,note:'otra'})).status()).toBeGreaterThanOrEqual(400);// only once
  expect((await decide(l1,'declined',1)).status()).toBe(400);// decisions are frozen: the closed version raises 22023, which the API answers as 400
  const ownerSees=await page.request.get(responseApi+'?'+new URLSearchParams({publicationId:pub}),{headers:{'X-Pro-Expected-Actor':owner}});
  expect(ownerSees.status()).toBe(200);expect((await ownerSees.json()).response.approvedCents).toBe(response.approvedCents);

  // The job is not converted from an opportunity here (the quote is already linked to the job), so the owner converts directly.
  const convertBody={action:'partial_response',actionId:crypto.randomUUID(),publicationId:pub,workId:f.workId};
  expect((await cc.request.post(origin+quoteApi,{headers:{Origin:origin},data:convertBody})).status()).toBeGreaterThanOrEqual(400);// the customer cannot
  const converted=await page.request.post(quoteApi,{headers:oh,data:convertBody});expect(converted.status(),await converted.text()).toBe(200);
  const result=acceptanceResultSchema.parse(await converted.json());expect(result).toMatchObject({action:'partial_response',workId:f.workId,lineCount:1,currency:'CRC'});
  expect(acceptanceResultSchema.parse(await (await page.request.post(quoteApi,{headers:oh,data:convertBody})).json()).estimateId).toBe(result.estimateId);// replay
  expect((await f.db.from('pro_private_estimate_work_agreements').select('estimate_id').eq('owner_id',owner).eq('work_id',f.workId)).data).toHaveLength(1);
  // A second conversion of the same response is refused.
  expect((await page.request.post(quoteApi,{headers:oh,data:{...convertBody,actionId:crypto.randomUUID()}})).status()).toBeGreaterThanOrEqual(400);

  // ---- (b) Acceptance recorded outside the platform (a different job: a fresh work) ----
  const work2=crypto.randomUUID();
  expect((await f.db.from('pro_work').insert({user_id:owner,id:work2,clientId:f.clientId,client:'Cliente '+id,service:'Cocina externa '+id,stage:'new',cancelled:false})).error).toBeNull();
  const ctx2=(await f.db.rpc('pro_private_estimate_context',{p_actor:owner,p_client:null,p_kind:'work',p_id:work2})).data as typeof ctx;
  const est2=crypto.randomUUID();
  const saved2=await f.db.rpc('pro_private_estimate_mutate',{p_actor:owner,p_input:{action:'save',actionId:crypto.randomUUID(),estimateId:est2,revision:0,clientId:ctx2.client.id,refreshClient:false,clientFingerprint:ctx2.clientFingerprint,source:ctx2.source,issuer:{...ctx2.issuer,issuerName:'Constructora QA'},title:'Cocina '+id,notes:'',currency:'CRC',validUntil:null,
   lines:[{id:crypto.randomUUID(),description:'Gabinetes',unit:'unid.',qtyMilli:1000,unitPriceCents:50000000,discountBps:0,taxBps:1300,catalogProductId:null,unitCostCents:20000000}]}});
  expect(saved2.error).toBeNull();
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const ext={action:'external',actionId:crypto.randomUUID(),estimateId:est2,estimateRevision:1,workId:work2,method:'signed_paper',acceptedOn:today,acceptedByName:'Cliente '+id,evidenceNote:'Firmó la copia impresa el '+today};
  expect((await page.request.post(quoteApi,{headers:oh,data:{...ext,actionId:crypto.randomUUID(),evidenceNote:'corta'}})).status()).toBe(400);// evidence required
  expect((await page.request.post(quoteApi,{headers:oh,data:{...ext,actionId:crypto.randomUUID(),acceptedOn:'2999-01-01'}})).status()).toBeGreaterThanOrEqual(400);// no future dates
  expect((await page.request.post(quoteApi,{headers:oh,data:{...ext,actionId:crypto.randomUUID(),estimateRevision:7}})).status()).toBe(409);// stale draft
  const recorded=await page.request.post(quoteApi,{headers:oh,data:ext});expect(recorded.status(),await recorded.text()).toBe(200);
  expect(acceptanceResultSchema.parse(await recorded.json())).toMatchObject({action:'external',workId:work2,method:'signed_paper',currency:'CRC'});
  expect((await f.db.from('pro_private_estimate_work_agreements').select('estimate_id').eq('owner_id',owner).eq('work_id',work2)).data).toHaveLength(1);
  const view=await page.request.get(quoteApi+'?'+new URLSearchParams({estimateId:est2}),{headers:{'X-Pro-Expected-Actor':owner}});expect(view.status()).toBe(200);expect((await view.json()).recorded).not.toBeNull();
  // The recorded content is immutable: the original draft can no longer change; a USD quote cannot become an agreement.
  const usd=crypto.randomUUID();expect(await save(usd,'USD '+id,'USD',[crypto.randomUUID()])).toBeNull();
  expect((await page.request.post(quoteApi,{headers:oh,data:{...ext,actionId:crypto.randomUUID(),estimateId:usd,estimateRevision:1,workId:f.workId}})).status()).toBeGreaterThanOrEqual(400);
 }finally{for(const c of contexts)await c.close().catch(()=>{});if(customer)await cleanupDisposableAccount(customer).catch(()=>{});await f.cleanup();}
});
