import {z} from 'zod';
/**
 * Fix 14 — parity register row 39: per-item («partida») approval of a quote version shared with the
 * linked customer. The customer approves or declines each line while the version is open; the
 * professional reads the decisions and the approved total. The version's own answer is unchanged.
 */
const uuid=z.string().uuid();
export const quoteLineDecisionValues=['approved','declined'] as const;
export const quoteLineSchema=z.object({lineId:uuid,position:z.number().int().positive(),description:z.string().max(2000),unit:z.string().max(40).nullable(),
 qtyMilli:z.number().int().nonnegative(),unitPriceCents:z.number().int().nonnegative(),totalCents:z.number().int().nonnegative(),
 /** Round F1-C: section name of the line (null or absent without one). */
 group:z.string().max(80).nullable().optional(),hasImage:z.boolean(),
 decision:z.enum(quoteLineDecisionValues).nullable(),note:z.string().max(300),revision:z.number().int().nonnegative(),decidedAt:z.string().nullable()}).strict();
export type QuoteLine=z.infer<typeof quoteLineSchema>;
export const quoteLineDecisionsSchema=z.object({publicationId:uuid,side:z.enum(['owner','client']),status:z.string().min(1).max(40),version:z.number().int().positive(),
 title:z.string().nullable(),currency:z.enum(['CRC','USD']),canDecide:z.boolean(),lines:z.array(quoteLineSchema).max(500),totalCents:z.number().int().nonnegative().nullable(),
 approvedCents:z.number().int().nonnegative(),declinedCents:z.number().int().nonnegative(),approvedCount:z.number().int().nonnegative(),declinedCount:z.number().int().nonnegative(),pendingCount:z.number().int().nonnegative()}).strict();
export type QuoteLineDecisions=z.infer<typeof quoteLineDecisionsSchema>;
export const quoteLineDecideSchema=z.object({actionId:uuid,publicationId:uuid,lineId:uuid,decision:z.enum(quoteLineDecisionValues).nullable(),note:z.string().trim().max(300),revision:z.number().int().min(0).max(2147483646)}).strict();
export type QuoteLineDecide=z.infer<typeof quoteLineDecideSchema>;
