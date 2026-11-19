import {z} from 'zod';
const optionalText=(max:number)=>z.string().max(max).nullable();
export const directProjectQuoteSchema=z.object({
 context:z.enum(['direct','project']),clientActionId:z.string().uuid(),proClientId:z.string().min(1).max(160).nullable(),projectId:z.string().uuid().optional(),
 sourceManualLeadId:z.string().uuid().optional(),sourceManualLeadRevision:z.number().int().positive().max(2147483647).optional(),
 clientName:optionalText(160),clientPhone:optionalText(40),clientCedula:optionalText(40),clientEmail:optionalText(254),title:optionalText(160),notes:optionalText(3000),
 items:z.array(z.object({description:z.string().min(1).max(500),quantity:z.number().finite().positive().max(9999).refine(v=>Math.abs(v*100-Math.round(v*100))<1e-7),unit_price:z.number().int().min(0).max(222222222)}).strict()).min(1).max(20),
 taxMode:z.enum(['incluido','mas_iva','exento']),validDays:z.number().int().min(1).max(90),
}).strict().superRefine((v,c)=>{if((v.context==='project')!==!!v.projectId||v.context==='project'&&!v.proClientId||v.context==='direct'&&!v.clientName?.trim())c.addIssue({code:'custom',path:['projectId'],message:'Invalid quote context'});if(!!v.sourceManualLeadId!==(v.sourceManualLeadRevision!==undefined)||v.sourceManualLeadId&&(v.context!=='direct'||!v.proClientId))c.addIssue({code:'custom',path:['sourceManualLeadId'],message:'Invalid manual lead context'});});
const fields='id,professional_id,client_id,client_name,client_phone,client_cedula,client_email,public_code,quote_number,project_id,proposal_id,title,items,tax_mode,subtotal,tax_amount,total,notes,valid_until,status,accepted_at,declined_at,created_at,updated_at,professional_name,professional_full_name'.split(',');
export function directProjectQuoteDto(quote:Record<string,unknown>){return Object.fromEntries(fields.map(key=>[key,quote[key]??null]));}

export type DirectProjectQuoteInput=z.infer<typeof directProjectQuoteSchema>;

/** Same lowercase alphabet as the conventional public quote route. */
export function directProjectPublicCode(bytes:Uint8Array){
 if(bytes.length!==12)throw Error('Public code requires 12 random bytes');
 const alphabet='abcdefghjkmnpqrstuvwxyz23456789';
 return Array.from(bytes,byte=>alphabet[byte%alphabet.length]).join('');
}
