import {z} from 'zod';

/**
 * Ronda F2-B (parity row 35): context for the one-click "Cotizar" of a lead. Mirrors
 * docs/pro/sql/lead-quick-quote-local.sql (read only). The quote itself is created by the existing
 * private-estimate editor and writer; the matched catalogue item only pre-fills the first line.
 */
const id=z.string().uuid();
export const leadQuickQuoteMatchSchema=z.object({productId:z.string().min(1).max(160),name:z.string().min(1),unit:z.string().max(30),priceCents:z.number().int().min(0),
 itemType:z.enum(['product','service']),matchedBy:z.enum(['exact','contains','words']),score:z.number().int().min(35).max(100)}).strict();
export const leadQuickQuoteContextSchema=z.object({kind:z.enum(['manual','request']),id,service:z.string(),clientId:z.string().min(1).max(160).nullable(),clientName:z.string().nullable(),
 source:z.union([z.object({kind:z.literal('manual'),id,revision:z.number().int().positive()}).strict(),z.object({kind:z.literal('work'),id:z.string().min(1).max(160)}).strict()]).nullable(),
 blocked:z.enum(['archived','no_client','client_archived']).nullable(),match:leadQuickQuoteMatchSchema.nullable()}).strict()
 .refine(v=>(v.blocked==='no_client')===(v.clientId===null)&&(v.source?.kind!=='manual'||v.kind==='manual'));
export type LeadQuickQuoteContext=z.infer<typeof leadQuickQuoteContextSchema>;
export type LeadQuickQuoteMatch=z.infer<typeof leadQuickQuoteMatchSchema>;
/** URL value that binds the pre-filled catalogue line to one new draft (a stale value never fills another draft). */
export const quickQuoteLineParam=(estimateId:string,productId:string)=>estimateId+':'+productId;
export function quickQuoteLineFor(value:string|null|undefined,estimateId:string){if(!value||!value.startsWith(estimateId+':'))return null;const product=value.slice(estimateId.length+1);return product&&product.length<=160?product:null;}
