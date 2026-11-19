import {z} from 'zod';
// A session-local unfinished form, scoped to one signed-in account. Never a sent document.
export const proQuoteDraftSchema=z.object({
 version:z.literal(1),savedAt:z.number().finite(),proClientId:z.string().max(160),
 createdQuoteId:z.string().uuid().optional(),sourceProjectId:z.string().uuid().optional(),
 sourceManualLeadId:z.string().uuid().optional(),sourceManualLeadRevision:z.number().int().positive().max(2147483647).optional(),
 sourceRequestId:z.string().uuid().optional(),clientActionId:z.string().uuid().optional(),requestPending:z.boolean().optional(),cedula:z.string().max(40),
 clientName:z.string().max(80),clientPhone:z.string().max(40),clientEmail:z.string().max(120),
 title:z.string().max(120),notes:z.string().max(2000),validDays:z.number().int().min(1).max(90),
 taxMode:z.enum(['incluido','mas_iva','exento']),
 rows:z.array(z.object({description:z.string().max(140),quantity:z.string().max(40),unit_price:z.string().max(40)})).min(1).max(20),
}).refine(value=>!value.requestPending||(!!value.sourceRequestId&&!!value.clientActionId),{message:'Pending attempts require their original request and action.'}).refine(value=>[value.sourceRequestId,value.sourceProjectId,value.sourceManualLeadId].filter(Boolean).length<=1,{message:'A draft has one source.'}).refine(value=>!!value.sourceManualLeadId===(value.sourceManualLeadRevision!==undefined),{message:'Manual lead drafts retain their source revision.'});
export class ProQuoteDraftRecoveryError extends Error {}
export type ProQuoteDraft=z.infer<typeof proQuoteDraftSchema>;
export const proQuoteDraftKey=(accountId:string)=>`ccr:pro:quote-draft:${accountId}`;
export function readProQuoteDraft(accountId:string):ProQuoteDraft|null{
 let raw:string|null;
 try{raw=sessionStorage.getItem(proQuoteDraftKey(accountId));}catch{throw new ProQuoteDraftRecoveryError('Draft storage is unavailable.');}
 if(!raw)return null;
 if(raw.length>64000)throw new ProQuoteDraftRecoveryError('Draft recovery is required.');
 try{
  const result=proQuoteDraftSchema.safeParse(JSON.parse(raw));
  if(!result.success||result.data.savedAt>Date.now()+60000)throw new ProQuoteDraftRecoveryError('Draft recovery is required.');
  // A durable receipt or an uncertain write must not expire into a fresh form.
  return result.data.requestPending||result.data.createdQuoteId||Date.now()-result.data.savedAt<48*3600000?result.data:null;
 }catch{throw new ProQuoteDraftRecoveryError('Draft recovery is required.');}
}
