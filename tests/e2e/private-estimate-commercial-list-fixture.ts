import {randomBytes} from 'node:crypto';
import {expect,type BrowserContext} from 'playwright/test';
import {workFixture,cleanupWorkFixture,type WorkFixture} from './private-estimate-work-fixture';
import {json,post,estimateInput} from './pro-private-estimate-publications-fixture';
export {workFixture as commercialFixture,cleanupWorkFixture as cleanupCommercial};
export {local,snapshot,state,oldDocuments,estimateRows,post,json} from './pro-private-estimate-publications-fixture';
export type CommercialFixture=WorkFixture;
export const estimates='/api/pro/private-estimates',publications='/api/pro/private-estimate-publications';
export async function savedDraft(context:BrowserContext,f:CommercialFixture,patch:Record<string,unknown>={}){
 const current=await json(context,{view:'context',clientId:f.clientId});
 const input=estimateInput(current,{validUntil:'2030-12-31',...patch}),response=await post(context,f.owner,input);
 expect(response.status()).toBe(200);
 return{input,estimate:(await response.json()).estimate};
}
export async function publishState(context:BrowserContext,f:CommercialFixture,draft:Awaited<ReturnType<typeof savedDraft>>,status:'awaiting_claim'|'shared'|'changes_requested'|'accepted'|'declined'|'withdrawn'='shared'){
 const input={action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:draft.estimate.id,estimateRevision:draft.estimate.revision,recipient:{kind:'claim',email:f.recipient.email,code:randomBytes(32).toString('hex')}};
 const created=await post(context,f.owner,input,publications);expect(created.status()).toBe(200);
 let publication=(await created.json()).publication;
 if(status!=='awaiting_claim'){
  const response=await post(f.recipientContext,f.recipient,{action:'claim',actionId:crypto.randomUUID(),code:input.recipient.code},publications);expect(response.status()).toBe(200);publication=(await response.json()).publication;
 }
 if(!['awaiting_claim','shared'].includes(status)){
  const action=status==='changes_requested'?'request_changes':status==='accepted'?'accept':status==='declined'?'decline':'withdraw';
  const body={action,actionId:crypto.randomUUID(),publicationId:publication.publicationId,revision:publication.revision,contentHash:publication.contentHash,...(action==='request_changes'?{note:'Aclarar el alcance'}:{})};
  const response=await post(action==='withdraw'?context:f.recipientContext,action==='withdraw'?f.owner:f.recipient,body,publications);expect(response.status()).toBe(200);
 }
 const owner=await context.request.get(publications+'?'+new URLSearchParams({view:'detail',publicationId:input.publicationId}));expect(owner.status()).toBe(200);
 return{input,publication:(await owner.json()).publication};
}
export async function sales(context:BrowserContext,query:Record<string,string>={}){
 const response=await context.request.get(estimates+'?'+new URLSearchParams({view:'sales',...query}));expect(response.status()).toBe(200);return response.json();
}
export async function publicationRows(f:CommercialFixture){
 const ownerRows=(await f.db.from('pro_private_estimate_publications').select('id').eq('owner_id',f.owner.id).throwOnError()).data!,ids=ownerRows.map(row=>row.id);
 const entries=await Promise.all(['pro_private_estimate_publications','pro_private_estimate_publication_states','pro_private_estimate_publication_invites','pro_private_estimate_publication_recipients','pro_private_estimate_publication_events','pro_private_estimate_publication_actions'].map(async table=>{
  let query=f.db.from(table).select('*');
  if(table==='pro_private_estimate_publications'||table.endsWith('_recipients'))query=query.eq('owner_id',f.owner.id);
  else if(table.endsWith('_actions'))query=query.in('actor_id',[f.owner.id,f.recipient.id]);
  else query=query.in('publication_id',ids);
  const result=await query.throwOnError();return[table,result.data?.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))];
 }));
 return Object.fromEntries(entries);
}
export function assertCompact(row:Record<string,unknown>){
 const keys=['kind','id','key','title','client','clientId','status','currency','totalCents','at'];
 if(row.kind==='private_estimate')keys.push('publication','draft');
 expect(Object.keys(row).toSorted()).toEqual(keys.toSorted());
 for(const key of ['lines','issuer','notes','source','clientFingerprint','customer','ownerId','email','phone'])expect(row).not.toHaveProperty(key);
 if(row.publication)expect(Object.keys(row.publication as object).toSorted()).toEqual(['publicationId','version','estimateRevision','revision','status','contentHash','createdAt'].toSorted());
 if(row.draft)expect(Object.keys(row.draft as object).toSorted()).toEqual(['revision','status']);
}
