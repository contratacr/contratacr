import {expect,type Browser,type BrowserContext} from 'playwright/test';
import {clientSchema} from '../../src/lib/pro/business';
import {privateEstimateDestinationCopyContextSchema,privateEstimateDestinationCopyPreviewSchema,privateEstimateDestinationCopyInputSchema,type PrivateEstimateDestinationCopySource} from '../../src/lib/pro/private-estimate-destination-copy';
import {publicationCopyFixture,cleanupPublicationCopy,copyBusiness,estimateRows,post,json,local,login} from './private-estimate-publication-copy-fixture';
import {manualLead,convertedWork} from './private-estimate-work-fixture';
export {post,json,local,login,estimateRows};
export const destinationCopyApi='/api/pro/private-estimate-destination-copy';

export async function destinationCopyFixture(context:BrowserContext,browser:Browser){
 const f=await publicationCopyFixture(context,browser);
 try{
  const destinationClient=clientSchema.parse({id:f.secondClient,name:'DESTINATION_CLIENT_B',email:'destination-b@example.test',phone:'88882222',notes:'Destination contact remains private',archived:false,identification:'201230456',address:'DESTINATION_ADDRESS_B',tradeName:'Destination business B'});
  await f.db.from('pro_clients').update(destinationClient).eq('user_id',f.owner.id).eq('id',destinationClient.id).throwOnError();
  const destinationManual=await manualLead(context,{...f,clientId:f.secondClient});
  const converted=await convertedWork(context,{...f,clientId:f.secondClient});
  return{...f,destinationClient,destinationManual,destinationManualId:destinationManual.id,destinationWorkId:converted.result.work.id as string};
 }catch(error){await cleanupPublicationCopy(f);throw error;}
}
export type DestinationCopyFixture=Awaited<ReturnType<typeof destinationCopyFixture>>;
export async function cleanupDestinationCopy(f:DestinationCopyFixture){await cleanupPublicationCopy(f);}
export function historicalSource(f:DestinationCopyFixture):PrivateEstimateDestinationCopySource{return{kind:'publication',publicationId:f.publication.publicationId,version:f.publication.version,estimateRevision:f.publication.estimateRevision,contentHash:f.publication.contentHash};}
export function draftSource(f:DestinationCopyFixture):PrivateEstimateDestinationCopySource{return{kind:'draft',estimateId:f.estimateB.id,revision:f.estimateB.revision};}
export async function sourcePreview(context:BrowserContext,source:PrivateEstimateDestinationCopySource){
 const query:Record<string,string>={view:'source',kind:source.kind};
 if(source.kind==='draft'){query.estimateId=source.estimateId;query.revision=String(source.revision);}
 else{query.publicationId=source.publicationId;query.version=String(source.version);query.estimateRevision=String(source.estimateRevision);query.contentHash=source.contentHash;}
 const response=await context.request.get(destinationCopyApi+'?'+new URLSearchParams(query));expect(response.status()).toBe(200);return privateEstimateDestinationCopyPreviewSchema.parse(await response.json());
}
export async function destinationContext(context:BrowserContext,query:Record<string,string>){
 const response=await context.request.get(destinationCopyApi+'?'+new URLSearchParams({view:'context',...query}));expect(response.status()).toBe(200);return privateEstimateDestinationCopyContextSchema.parse(await response.json());
}
export function destinationCopyInput(source:PrivateEstimateDestinationCopySource,destination:Awaited<ReturnType<typeof destinationContext>>){return privateEstimateDestinationCopyInputSchema.parse({action:'copy_to_destination',actionId:crypto.randomUUID(),targetEstimateId:crypto.randomUUID(),source,destination:{clientId:destination.client.id,clientFingerprint:destination.clientFingerprint,source:destination.source}});}
export async function destinationCopyBusiness(f:DestinationCopyFixture){
 return{...await copyBusiness(f),workAgreements:(await f.db.from('pro_private_estimate_work_agreements').select('*').eq('owner_id',f.owner.id).order('work_id').throwOnError()).data,workActions:(await f.db.from('pro_private_estimate_work_actions').select('*').eq('actor_id',f.owner.id).order('action_id').throwOnError()).data};
}
