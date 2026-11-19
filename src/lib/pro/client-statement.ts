import {z} from 'zod';
import type {PaymentMethod} from './invoice-payments';
export const clientStatementQuery=z.object({clientId:z.string().min(1).max(160),after:z.string().max(1000).default('')});
export const clientStatementCursor=z.object({at:z.string().datetime({offset:true}).max(40),id:z.string().uuid()});
export type ClientStatementEntry={id:string;kind:'agreement'|'payment'|'payment_void'|'direct_payment'|'credit_note'|'credit_note_reversal';workId:string|null;workTitle:string|null;workCancelled:boolean;amountCents:number;previousAgreementCents:number|null;balanceDeltaCents:number;at:string;receivedOn:string|null;method:PaymentMethod|null;reference:string|null;label:string;reversed:boolean;superseded:boolean;paymentId:string|null;creditNote?:ClientStatementCreditNote};
/** Applied credit note (not money): reduces what the job owes; a reversal restores it. */
export type ClientStatementCreditNote={creditId:string;code:string;reason:string|null;draftId:string;draftTitle:string|null};
export type ClientStatementPage={revision:string;client:{id:string;name:string;archived:boolean};summary:{agreedCents:number;paidCents:number;balanceCents:number;creditCents:number;creditNotesCents:number;creditNoteCount:number;unpriced:number;workCount:number;standaloneReceivedCents:number;standaloneAvailableCents:number};items:ClientStatementEntry[];nextCursor:string|null};
