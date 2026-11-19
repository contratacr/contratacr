import {z} from 'zod';
const id=z.string().trim().min(1).max(160);
/** Round 7B: optional quantity (thousandths), unit cost and markup (basis points); when given, the
 * amount is exactly round(qty × cost × (1 + markup)) — the server checks the same formula. */
export const workChangeLine=z.object({description:z.string().trim().min(1).max(160),amountCents:z.number().int().min(-10000000000).max(10000000000).refine(n=>n!==0),
 qtyMilli:z.number().int().min(1).max(1000000000).optional(),unitCostCents:z.number().int().min(0).max(10000000000).optional(),markupBps:z.number().int().min(0).max(100000).optional()}).strict()
 .refine(l=>(l.qtyMilli===undefined)===(l.unitCostCents===undefined)&&(l.qtyMilli===undefined)===(l.markupBps===undefined),{message:'Cantidad, costo y recargo van juntos.'})
 .refine(l=>l.qtyMilli===undefined||Math.abs(l.amountCents)===workChangeLineAmount(l.qtyMilli,l.unitCostCents!,l.markupBps!),{message:'El monto no coincide con cantidad, costo y recargo.'});
export function workChangeLineAmount(qtyMilli:number,unitCostCents:number,markupBps:number){return Number((BigInt(qtyMilli)*BigInt(unitCostCents)*BigInt(10000+markupBps)*BigInt(2)+BigInt(10000000))/(BigInt(10000000)*BigInt(2)));}
const base={id:z.string().uuid(),actionId:z.string().uuid(),revision:z.number().int().positive()};
export const workChangeMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('propose'),id:z.string().uuid(),actionId:z.string().uuid(),workId:id,baseCents:z.number().int().min(0).max(10000000000),reason:z.string().trim().min(1).max(500),lines:z.array(workChangeLine).min(1).max(20),scheduleDays:z.number().int().min(0).max(365).optional()}).strict(),
 z.object({...base,action:z.enum(['accept','decline','withdraw'])}).strict(),
 z.object({...base,action:z.literal('record_acceptance'),note:z.string().trim().min(10).max(500)}).strict(),
]).superRefine((v,ctx)=>{if(v.action==='propose'){const total=v.baseCents+v.lines.reduce((s,l)=>s+l.amountCents,0);if(total<0||total>10000000000)ctx.addIssue({code:'custom',path:['lines'],message:'Revise el nuevo total.'});}});
export type WorkChangeInput=z.infer<typeof workChangeMutation>;
export type WorkChange={id:string;position:number;reason:string;lines:z.infer<typeof workChangeLine>[];baseCents:number;deltaCents:number;totalCents:number;status:'proposed'|'accepted'|'declined'|'withdrawn';stale:boolean;revision:number;recordedBy:'provider'|'client'|null;acceptanceNote:string;createdAt:string;updatedAt:string;scheduleDays?:number;scheduleApplied?:boolean};
export type WorkChangesPage={side:'provider'|'client';workId:string;service:string;clientLinked:boolean;canPropose:boolean;account:{agreedCents:number|null;paidCents:number;balanceCents:number};items:WorkChange[];nextCursor:number|null};
export function signedCents(value:string){if(!/^-?\d{1,9}(?:[.,]\d{1,2})?$/.test(value))return null;const sign=value.startsWith('-')?-1:1;const [whole,fraction='']=value.replace('-','').replace(',','.').split('.');const n=sign*(Number(whole)*100+Number(fraction.padEnd(2,'0')));return Math.abs(n)<=10000000000?n:null;}
