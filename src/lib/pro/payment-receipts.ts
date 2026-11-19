import {z} from 'zod';
import type {InvoiceIssuer} from './invoice-preparation';
import type {InvoiceDraft} from './invoice-drafts';

export const paymentReceiptPrepareSchema=z.object({entryId:z.string().uuid()});
export const paymentReceiptQuerySchema=z.object({id:z.string().uuid().optional(),q:z.string().trim().max(160).default(''),status:z.enum(['all','active','reversed']).default('all'),clientId:z.string().max(160).default(''),after:z.string().max(1000).default('')});
export const paymentReceiptCursorSchema=z.object({at:z.string().datetime({offset:true}).max(40),id:z.string().uuid()});
/** Internal copy of an existing payment. It never creates a payment or debt. */
export type PaymentReceipt={id:string;entryId:string;clientId:string;workId:string;clientName:string;workTitle:string;receiver:InvoiceDraft['receiver'];issuer:InvoiceIssuer;amountCents:number;currency:'CRC';paymentRegisteredAt:string;preparedAt:string;note:string;reversed:boolean;voidedAt:string|null;voidReason:string|null};

export type PaymentReceiptSummary=Omit<PaymentReceipt,'receiver'|'issuer'>;
