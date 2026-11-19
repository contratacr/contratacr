import {randomBytes} from 'node:crypto';
import {expect,type Browser,type BrowserContext} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {fixture,cleanup,login,post,json,estimateInput} from './pro-private-estimate-publications-fixture';
export {local,snapshot,state,oldDocuments,estimateRows,post,json} from './pro-private-estimate-publications-fixture';
export const workEndpoint='/api/pro/private-estimate-work',publicationsEndpoint='/api/pro/private-estimate-publications';
export async function workFixture(context:BrowserContext,browser:Browser){
 const owner=await fixture(context);
 let recipient:Awaited<ReturnType<typeof createDisposableAccount>>|undefined,recipientContext:BrowserContext|undefined;
 try {
  recipient=await createDisposableAccount({prefix:'accepted-work-recipient'});
  recipientContext=await browser.newContext({baseURL:'http://127.0.0.1:3185'});
  await login(recipientContext,recipient);
  return{...owner,recipient,recipientContext};
 } catch(error) {
  const results=await Promise.allSettled([recipientContext?.close(),cleanupDisposableAccount(recipient),cleanup(owner)]);
  const failures=results.filter(result=>result.status==='rejected').map(result=>result.reason);
  if(failures.length)throw new AggregateError([error,...failures],'Private accepted-work fixture setup and cleanup failed');
  throw error;
 }
}
export type WorkFixture=Awaited<ReturnType<typeof workFixture>>;
export async function cleanupWorkFixture(f:WorkFixture){await f.recipientContext.close();await cleanupDisposableAccount(f.recipient);await cleanup(f);}
export async function acceptedDocument(context:BrowserContext,f:WorkFixture,source?:{kind:'manual'|'work';id:string},patch:Record<string,unknown>={}){
 const query:Record<string,string>={view:'context'};
 if(source){query.sourceKind=source.kind;query.sourceId=source.id;}else query.clientId=f.clientId;
 const ctx=await json(context,query);
 const save=estimateInput(ctx,{validUntil:'2030-12-31',...patch}),saved=await post(context,f.owner,save);expect(saved.status()).toBe(200);
 const estimate=(await saved.json()).estimate,code=randomBytes(32).toString('hex');
 const publish={action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:estimate.id,estimateRevision:1,recipient:{kind:'claim',email:f.recipient.email,code}};
 expect((await post(context,f.owner,publish,publicationsEndpoint)).status()).toBe(200);
 const claim=await post(f.recipientContext,f.recipient,{action:'claim',actionId:crypto.randomUUID(),code},publicationsEndpoint);expect(claim.status()).toBe(200);
 const publication=(await claim.json()).publication,accept={action:'accept',actionId:crypto.randomUUID(),publicationId:publication.publicationId,revision:publication.revision,contentHash:publication.contentHash};
 const response=await post(f.recipientContext,f.recipient,accept,publicationsEndpoint);expect(response.status()).toBe(200);
 const accepted=(await response.json()).publication;
 const event=(await f.db.from('pro_private_estimate_publication_events').select('*').eq('publication_id',publication.publicationId).eq('action_id',accept.actionId).single().throwOnError()).data!;
 return{save,estimate,publish,accept,publication:accepted,event};
}
export function manualInput(f:WorkFixture){return{action:'create',actionId:crypto.randomUUID(),kind:'manual',id:crypto.randomUUID(),revision:0,catalogRevision:0,clientId:f.clientId,title:'Origen manual del acuerdo aceptado',description:'Descripción privada',address:'Por coordinar',sourceLabel:'Referencia privada',forecast:{projectType:'',expectedStart:null,currency:'CRC',revenueCents:null,budgetCents:null,profitCents:null},stageMode:'automatic',stageId:null};}
export async function manualLead(context:BrowserContext,f:WorkFixture){const input=manualInput(f),response=await post(context,f.owner,input,'/api/pro/lead-private-core');expect(response.status()).toBe(200);return input;}
export async function convertedWork(context:BrowserContext,f:WorkFixture){const lead=await manualLead(context,f),input={action:'convert',actionId:crypto.randomUUID(),leadId:lead.id,leadRevision:1,workId:crypto.randomUUID()},response=await post(context,f.owner,input,'/api/pro/lead-private-work');expect(response.status()).toBe(200);return{lead,input,result:await response.json()};}
export async function workRead(context:BrowserContext,query:Record<string,string>){return context.request.get(workEndpoint+'?'+new URLSearchParams(query));}
export async function checkedWork(context:BrowserContext,query:Record<string,string>){const response=await workRead(context,query);expect(response.status()).toBe(200);return response.json();}
export function newIntent(document:Awaited<ReturnType<typeof acceptedDocument>>,workId=crypto.randomUUID()){return{action:'continue',actionId:crypto.randomUUID(),publicationId:document.publication.publicationId,contentHash:document.publication.contentHash,publicationRevision:document.publication.revision,target:{kind:'new',workId,conversionActionId:null,leadRevision:null}};}
export async function assertOnlyWorkAppend(f:WorkFixture,before:Awaited<ReturnType<typeof import('./pro-private-estimate-publications-fixture').snapshot>>,workId:string,revisionDelta:number,createdAt:string){
 const {snapshot}=await import('./pro-private-estimate-publications-fixture');
 const after=await snapshot(f),oldWork=before.pro_work as Record<string,unknown>[],newWork=after.pro_work as Record<string,unknown>[];
 expect(newWork.filter(row=>row.id!==workId)).toEqual(oldWork);expect(newWork.filter(row=>row.id===workId)).toHaveLength(1);
 const oldPanels=before.pro_workspaces as {user_id:string;document:Record<string,unknown>;revision:number;updated_at:string}[],newPanels=after.pro_workspaces as typeof oldPanels;
 const panel=oldPanels[0],next=newPanels[0];
 const rows=(await f.db.from('pro_work').select('*').eq('user_id',f.owner.id).order('position').throwOnError()).data!;
 const projected=rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key,value])=>key!=='user_id'&&key!=='position'&&value!==null)));
 const core=(await f.db.from('pro_workspace_core').select('updated_at').eq('user_id',f.owner.id).single().throwOnError()).data!;
 expect(next).toEqual({...panel,document:{...panel.document,work:projected},revision:panel.revision+revisionDelta,updated_at:core.updated_at});
 expect(next.updated_at).not.toBe(panel.updated_at);
 expect(Date.parse(next.updated_at)).toBeGreaterThanOrEqual(Date.parse(panel.updated_at));
 expect(Date.parse(next.updated_at)).toBeLessThanOrEqual(Date.parse(createdAt));
 for(const key of Object.keys(before).filter(key=>!['pro_work','pro_workspaces'].includes(key)))expect(after[key],key).toEqual(before[key]);
}
