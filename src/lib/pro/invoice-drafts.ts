import {z} from 'zod';
import {receiverFiscalShape} from './client-fiscal';
import {invoiceAmounts,invoiceDetailSchema,type EditableInvoiceLine} from './invoice-detail';
import {invoiceChargesSchema,type InvoiceCharge} from './invoice-extras';
import {invoicePreparationSchema,type InvoicePreparation} from './invoice-preparation';
const id=z.string().trim().min(1).max(160);
export const invoiceSourceKind=z.enum(['work','quote','legacy_quote']);
export const invoiceReceiverSchema=z.object({name:z.string().trim().min(1).max(160),identification:z.string().trim().max(40),email:z.union([z.literal(''),z.string().email().max(254)]),phone:z.string().trim().max(30),address:z.string().trim().max(500),...z.object(receiverFiscalShape).partial().shape}).superRefine((value,ctx)=>{const keys=Object.keys(receiverFiscalShape) as (keyof typeof receiverFiscalShape)[];if(keys.some(key=>value[key]!==undefined))for(const key of keys)if(value[key]===undefined)ctx.addIssue({code:'custom',path:[key],message:'Complete el grupo de datos fiscales.'});});
const editable={preparation:invoicePreparationSchema.optional(),title:z.string().trim().min(1).max(160),notes:z.string().trim().max(2000),receiver:invoiceReceiverSchema};
export const invoiceMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create_direct'),requestId:z.string().uuid(),clientId:id,title:editable.title,notes:editable.notes,lines:invoiceDetailSchema,charges:invoiceChargesSchema.optional()}),
 z.object({action:z.literal('detail'),id:z.string().uuid(),revision:z.number().int().positive(),lines:invoiceDetailSchema,charges:invoiceChargesSchema.optional()}),
 z.object({action:z.literal('reset_detail'),id:z.string().uuid(),revision:z.number().int().positive()}),
 z.object({action:z.literal('create'),kind:invoiceSourceKind,sourceId:id,clientId:id,fingerprint:z.string().regex(/^[a-f0-9]{32}$/),manualTotalCents:z.number().int().min(0).max(10000000000).optional(),...editable}),
 z.object({action:z.literal('update'),id:z.string().uuid(),revision:z.number().int().positive(),...editable}),
 z.object({action:z.literal('refresh'),id:z.string().uuid(),revision:z.number().int().positive(),fingerprint:z.string().regex(/^[a-f0-9]{32}$/)}),
]).superRefine((input,ctx)=>{if(input.action==='detail'||input.action==='create_direct'){if(invoiceAmounts(input.lines,input.charges??[]).beforeExemptionCents>10000000000)ctx.addIssue({code:'custom',message:'El total con impuestos y cargos supera el límite del borrador.'});}});
export type InvoiceSourceKind=z.infer<typeof invoiceSourceKind>;
export type InvoiceReceiver=z.infer<typeof invoiceReceiverSchema>;
export type InvoiceLine={description:string;quantity:number;unitAmount:number;taxRate:number|null};
export type InvoiceSource={kind:InvoiceSourceKind;sourceId:string;workId:string|null;quoteId:string|null;quoteKind:'quote'|'legacy_quote'|null;clientId:string|null;receiver:InvoiceReceiver;title:string;lines:InvoiceLine[];totalCents:number|null;taxCents:number|null;agreedCents:number|null;paidCents:number|null;balanceCents:number|null;materialCount:number;materialCost:number;basis:'agreement'|'quote'|'manual';multipleWorks:boolean;sharedQuote:boolean;fingerprint:string};
export type InvoiceMaterial={entryId:string;productId:string;name:string;quantity:number;unitCost:number};
export type InvoiceDraft={charges?:InvoiceCharge[];editedDetail?:{sourceTotalCents:number;sourceTaxCents:number|null;gross:string;grossTax?:string;exonerated?:string;specialTax?:string;chargeTotal?:string;discount:string;net:string;tax:string;total:string;version:string;lines:EditableInvoiceLine[]}|null;preparation?:InvoicePreparation|null;id:string;clientId:string;kind:InvoiceSourceKind|'direct';sourceId:string;title:string;notes:string;receiver:InvoiceReceiver;revision:number;totalCents:number;taxCents:number|null;agreedCents:number|null;paidCents:number|null;balanceCents:number|null;materialCount:number;materialCost:number;basis:InvoiceSource['basis'];lines:InvoiceLine[];materials:InvoiceMaterial[];nextCursor:string|null;sourceChanged:boolean;sourceNeedsAmount:boolean;sourceAvailable:boolean;currentFingerprint:string|null;createdAt:string;updatedAt:string};
