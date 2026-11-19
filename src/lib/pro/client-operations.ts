import {z} from 'zod';
const id=z.string().min(1).max(160);
const common={clientId:id,workId:id,actionId:z.string().uuid(),revision:z.number().int().nonnegative()};
export const operationSchema=z.discriminatedUnion('kind',[
 z.object({...common,kind:z.literal('agreement'),amountCents:z.number().int().min(0).max(10000000000)}),
 z.object({...common,kind:z.literal('payment'),amountCents:z.number().int().positive().max(10000000000),note:z.string().trim().max(160).default('')}),
 z.object({...common,kind:z.literal('material'),productId:id,quantity:z.number().finite().positive().max(100000).refine(n=>Math.abs(n*1000-Math.round(n*1000))<0.00001)}),
 z.object({...common,kind:z.enum(['material_return','payment_void']),entryId:z.string().uuid(),note:z.string().trim().min(1).max(160)}),
]);
export type ClientOperation=z.infer<typeof operationSchema>;
export type ClientWorkAccount={id:string;service:string;stage:string;cancelled:boolean;start:string;quoteId:string|null;externalQuoteId:string|null;agreedCents:number|null;paidCents:number;balanceCents:number;materialCount:number;materialCost:number;agreedSource?:'agreement'|'quote'|'estimate'|null;agreedTaxCents?:number|null;creditNotesCents?:number;customerBalanceCents?:number|null};
export type ClientEntry={id:string;kind:ClientOperation['kind'];amountCents:number|null;quantity:number|null;label:string;at:string;reversed:boolean};
export type ClientOperationsPage={revision:number;summary:{agreedCents:number;paidCents:number;balanceCents:number;unpriced:number;creditNotesCents?:number;customerBalanceCents?:number};items:ClientWorkAccount[];nextCursor:string|null;work:ClientWorkAccount|null;entries:ClientEntry[];nextEntryCursor:string|null};
/** Decimal input to integer cents without floating-point multiplication. */
export function inputCents(value:string):number|null{
 value=value.trim();
 if(!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(value))return null;
 const [whole,fraction='']=value.replace(',','.').split('.');
 const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return cents<=10000000000?cents:null;
}
