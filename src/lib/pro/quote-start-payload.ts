import {z} from 'zod';
/** Area D: one-time hand-off from "Create with AI" / "Import from file" to the new-quote editor (per tab, per account, per new quote id). */
export const quoteStartPayloadSchema=z.object({
 version:z.literal(1),title:z.string().max(160),notes:z.string().max(2000),
 lines:z.array(z.object({description:z.string().min(1).max(2000),quantity:z.string().max(32),price:z.string().max(32)}).strict()).max(100),
}).strict();
export type QuoteStartPayload=z.infer<typeof quoteStartPayloadSchema>;
export const quoteStartPayloadKey=(actor:string,id:string)=>`ccr:pro:private-estimate-import:v1:${actor}:${id}`;
export function writeQuoteStartPayload(actor:string,id:string,payload:Omit<QuoteStartPayload,'version'>){
 try{const text=JSON.stringify(quoteStartPayloadSchema.parse({version:1,...payload}));sessionStorage.setItem(quoteStartPayloadKey(actor,id),text);return sessionStorage.getItem(quoteStartPayloadKey(actor,id))===text;}catch{return false;}
}
export function readQuoteStartPayload(actor:string,id:string):QuoteStartPayload|null{
 try{const text=sessionStorage.getItem(quoteStartPayloadKey(actor,id));if(!text||text.length>600000)return null;return quoteStartPayloadSchema.parse(JSON.parse(text));}catch{return null;}
}
export function clearQuoteStartPayload(actor:string,id:string){try{sessionStorage.removeItem(quoteStartPayloadKey(actor,id));}catch{/* nothing to clear */}}
