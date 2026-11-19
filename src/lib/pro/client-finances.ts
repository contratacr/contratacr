import {z} from 'zod';

/**
 * Round 4A: «Finances» section of the customer view (pro_client_finances_client_read). Strict on
 * purpose: the customer payload has no cost, margin, note, label or reference key, and an
 * unexpected key fails parsing instead of reaching the screen.
 */
const cents=z.number().int().safe(),stamp=z.string().min(1).max(64);
export const clientFinancesSchema=z.discriminatedUnion('visible',[
 z.object({visible:z.literal(false)}).strict(),
 z.object({visible:z.literal(true),workTitle:z.string().max(300),
  summary:z.object({agreedCents:cents.nullable(),paidCents:cents,creditNotesCents:cents,balanceCents:cents.nullable(),creditCents:cents,invoicedCents:cents}).strict(),
  quotes:z.array(z.object({id:z.string().uuid(),title:z.string().max(300),version:z.number().int().positive(),status:z.enum(['shared','changes_requested','accepted','declined']),totalCents:cents,currency:z.enum(['CRC','USD']),sharedAt:stamp}).strict()).max(200),
  invoices:z.array(z.object({id:z.string().uuid(),title:z.string().max(300),createdAt:stamp,totalCents:cents}).strict()).max(500),
  payments:z.array(z.object({id:z.string().uuid(),amountCents:cents,receivedOn:z.string().max(10).nullable(),method:z.enum(['cash','card','transfer','sinpe','other']).nullable(),voided:z.boolean(),recordedAt:stamp}).strict()).max(1000),
 }).strict(),
]);
export type ClientFinances=z.infer<typeof clientFinancesSchema>;
