import {randomBytes} from 'node:crypto';
import {privateEstimateMutationSchema,privateEstimateSchema} from '../../src/lib/pro/private-estimates';
import {clientSchema} from '../../src/lib/pro/business';
import {expect,type Browser,type BrowserContext} from 'playwright/test';
import {commercialFixture,cleanupCommercial,publicationRows,type CommercialFixture} from './private-estimate-commercial-list-fixture';
import {json,post,estimateInput,snapshot,state,oldDocuments,estimateRows} from './pro-private-estimate-publications-fixture';
import {convertedWork,manualLead} from './private-estimate-work-fixture';
export {local,login} from './pro-private-estimate-publications-fixture';
export {snapshot,state,oldDocuments,estimateRows,post,json,publicationRows};
export const copyEndpoint='/api/pro/private-estimate-publication-copy';
export async function publicationCopyFixture(context:BrowserContext,browser:Browser,{status='accepted',source='direct'}:{status:'shared'|'accepted';source?:'direct'|'manual'|'work'}={status:'accepted'}){
 const f=await commercialFixture(context,browser);
 try {
  const historicalClient=clientSchema.parse({id:f.clientId,name:'HISTORICAL_CLIENT_A',email:'historical-a@example.test',phone:'PRIVATE_PHONE_A',notes:'',archived:false,identification:'101230456',address:'PRIVATE_ADDRESS_A',tradeName:'Historical business A'});
  await f.db.from('pro_clients').update(historicalClient).eq('user_id',f.owner.id).eq('id',f.clientId).throwOnError();
  const productId='publication-copy-service';
  await f.db.from('pro_products').insert({user_id:f.owner.id,id:productId,sku:'HIST-A',name:'Historical service A',stock:0,minimum:0,cost:7,price:19.99,archived:false,itemType:'service',unit:'hora'}).throwOnError();
  let sourceId:string|undefined;
  if(source==='manual')sourceId=(await manualLead(context,f)).id;
  if(source==='work')sourceId=(await convertedWork(context,f)).result.work.id;
  const query:Record<string,string>={view:'context'};
  if(sourceId){query.sourceKind=source;query.sourceId=sourceId;}else query.clientId=f.clientId;
  const sourceContext=await json(context,query);
  const base=estimateInput(sourceContext,{title:'HISTORICAL_PUBLICATION_A',notes:'PRIVATE_HISTORICAL_NOTES_A',issuer:{issuerName:'HISTORICAL_ISSUER_A',issuerIdType:'individual',issuerId:'101110111',issuerEmail:'issuer-a@example.test',issuerPhone:'88881111',issuerAddress:'Historical issuer address A',issuerActivity:'432100'},validUntil:'2030-12-31'});
  const input={...base,lines:base.lines.map((line,index)=>({...line,catalogProductId:index===0?productId:null}))};
  privateEstimateMutationSchema.parse(input);
  const response=await post(context,f.owner,input);expect(response.status()).toBe(200);const estimateA=privateEstimateSchema.parse((await response.json()).estimate);
  const code=randomBytes(32).toString('hex'),publish={action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:estimateA.id,estimateRevision:1,recipient:{kind:'claim',email:f.recipient.email,code}};
  expect((await post(context,f.owner,publish,'/api/pro/private-estimate-publications')).status()).toBe(200);
  const claimed=await post(f.recipientContext,f.recipient,{action:'claim',actionId:crypto.randomUUID(),code},'/api/pro/private-estimate-publications');expect(claimed.status()).toBe(200);
  let publication=(await claimed.json()).publication;
  if(status==='accepted'){
   const accepted=await post(f.recipientContext,f.recipient,{action:'accept',actionId:crypto.randomUUID(),publicationId:publication.publicationId,revision:publication.revision,contentHash:publication.contentHash},'/api/pro/private-estimate-publications');expect(accepted.status()).toBe(200);publication=(await accepted.json()).publication;
  }
  const ownerPublication=await context.request.get('/api/pro/private-estimate-publications?'+new URLSearchParams({view:'detail',publicationId:publication.publicationId}));expect(ownerPublication.status()).toBe(200);publication=(await ownerPublication.json()).publication;
  const contextB=await json(context,{view:'context',clientId:f.secondClient});
  const changed={...input,actionId:crypto.randomUUID(),revision:1,title:'CURRENT_DRAFT_B',notes:'CURRENT_NOTES_B',currency:'CRC',issuer:{...input.issuer,issuerName:'CURRENT_ISSUER_B',issuerActivity:'999900'},lines:[{...input.lines[0],qtyMilli:1000,unitPriceCents:100000,discountBps:0,taxBps:0,catalogProductId:null}],...(source==='direct'?{clientId:f.secondClient,clientFingerprint:contextB.clientFingerprint,refreshClient:true}:{})};
  const edited=await post(context,f.owner,changed);expect(edited.status()).toBe(200);const estimateB=(await edited.json()).estimate;
  return{...f,productId,sourceId,source,estimateA,estimateB,inputA:input,inputB:changed,publication};
 } catch(error){await cleanupCommercial(f);throw error;}
}
export type PublicationCopyFixture=Awaited<ReturnType<typeof publicationCopyFixture>>;
export async function cleanupPublicationCopy(f:PublicationCopyFixture){await cleanupCommercial(f);}
export function copyInput(f:PublicationCopyFixture){return{action:'copy_from_publication',actionId:crypto.randomUUID(),publicationId:f.publication.publicationId,version:f.publication.version,estimateRevision:f.publication.estimateRevision,contentHash:f.publication.contentHash,targetEstimateId:crypto.randomUUID()};}
export async function copyRead(context:BrowserContext,actionId:string){return context.request.get(copyEndpoint+'?'+new URLSearchParams({view:'action',actionId}));}
export async function copiedReceipt(context:BrowserContext,actionId:string){const response=await copyRead(context,actionId);expect(response.status()).toBe(200);return response.json();}
export async function copyBusiness(f:CommercialFixture){return{business:await snapshot(f),privateSources:await state(f),oldDocuments:await oldDocuments(f),publications:await publicationRows(f),products:(await f.db.from('pro_products').select('*').eq('user_id',f.owner.id).order('id').throwOnError()).data,movements:(await f.db.from('pro_movements').select('*').eq('user_id',f.owner.id).order('id').throwOnError()).data};}
