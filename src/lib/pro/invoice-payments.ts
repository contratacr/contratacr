import {z} from 'zod';
import {daySchema} from './panel-queries';
export const paymentMethodSchema=z.enum(['cash','card','transfer','sinpe','other']);
export type PaymentMethod=z.infer<typeof paymentMethodSchema>;
export const paymentToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const receivedOn=daySchema.refine(value=>value>='1900-01-01'&&value<=paymentToday(),'Indique la fecha en que recibió el pago, hasta hoy.');
const base={requestId:z.string().uuid(),draftId:z.string().uuid(),draftRevision:z.number().int().positive(),revision:z.number().int().nonnegative()};
export const invoicePaymentMutation=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('apply'),source:z.enum(['new','existing']),candidateId:z.string().uuid().optional(),amountCents:z.number().int().positive().max(10000000000),receivedOn,method:paymentMethodSchema,reference:z.string().trim().max(160).default('')}).superRefine((value,ctx)=>{if(value.source==='existing'&&!value.candidateId)ctx.addIssue({code:'custom',path:['candidateId'],message:'Seleccione un abono registrado.'});if(value.source==='new'&&value.candidateId)ctx.addIssue({code:'custom',path:['candidateId'],message:'El pago nuevo no debe reutilizar un identificador.'});}),
 z.object({...base,action:z.literal('unapply'),id:z.string().uuid(),reason:z.string().trim().min(1).max(160)}),
]);
export const invoicePaymentsQuery=z.object({id:z.string().uuid(),after:z.string().max(1000).default(''),candidatesAfter:z.string().max(1000).default('')});
export const invoicePaymentCursor=z.object({at:z.string().datetime({offset:true}).max(40),id:z.string().uuid()});
export type InvoicePaymentApplication={id:string;paymentId:string;entryId:string|null;amountCents:number;paymentAmountCents:number;receivedOn:string;method:PaymentMethod;reference:string;createdAt:string;voided:boolean;voidReason:string|null;sourceReversed:boolean};
export type InvoicePaymentCandidate={id:string;entryId:string|null;paymentId:string|null;amountCents:number;availableCents:number;label:string;registeredAt:string;receivedOn:string|null;method:PaymentMethod|null;reference:string|null};
export type InvoicePaymentsPage={draft:{id:string;title:string;clientId:string;clientName:string;workId:string|null;workTitle:string|null;totalCents:number;revision:number;archived:boolean};revision:number;summary:{appliedCents:number;creditNotesCents?:number;balanceCents:number;workBalanceCents:number|null;canRecord:boolean};items:InvoicePaymentApplication[];nextCursor:string|null;candidates:InvoicePaymentCandidate[];nextCandidateCursor:string|null};
