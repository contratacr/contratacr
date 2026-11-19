import {z} from 'zod';

/** Round 6A: contracts of /api/pro/payment-links (owner) and /api/pro/pay (public hosted page). */
const id=z.string().uuid();
/** Ledger ids derived in SQL (md5 → uuid) are valid UUID strings but not RFC 4122 v4. */
const anyUuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
export const paymentLinkTokenSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const paymentMethodsSchema=z.array(z.enum(['card','sinpe'])).min(1).max(2).refine(list=>new Set(list).size===list.length);
export const paymentTransactionSchema=z.object({id,kind:z.enum(['payment','refund']),entryId:anyUuid,amountCents:z.number().int(),at:z.string()});
export const paymentAttemptSchema=z.object({id,method:z.enum(['card','sinpe']),status:z.enum(['pending','requires_action','succeeded','failed','refunded']),amountCents:z.number().int(),cardLast4:z.string().nullable(),cardBrand:z.string().nullable(),
 sinpeReference:z.string().nullable(),failureCode:z.string().nullable(),processorRef:z.string(),createdAt:z.string(),transactions:z.array(paymentTransactionSchema)});
export const paymentLinkSchema=z.object({id,target:z.enum(['invoice','installment']),draftId:id.nullable(),planId:id.nullable(),planRevision:z.number().int().nullable(),seq:z.number().int().nullable(),workId:z.string(),
 amountCents:z.number().int(),currency:z.literal('CRC'),description:z.string(),provider:z.literal('tilopay'),mode:z.enum(['mock','sandbox','production']),methods:z.array(z.enum(['card','sinpe'])),
 status:z.enum(['active','paid','cancelled','expired']),expiresAt:z.string(),createdAt:z.string(),paidAt:z.string().nullable(),cancelledAt:z.string().nullable(),cancelReason:z.string().nullable(),attempts:z.array(paymentAttemptSchema)});
export type PaymentLink=z.infer<typeof paymentLinkSchema>;
export const paymentLinksReadSchema=z.object({dueCents:z.number().int().optional(),hasWork:z.boolean().optional(),links:z.array(paymentLinkSchema),
 mode:z.enum(['mock','sandbox','production']),modeStatus:z.enum(['ready','missing_keys','production_refused','disabled']),sinpePhone:z.string()});
export type PaymentLinksRead=z.infer<typeof paymentLinksReadSchema>;
export const paymentLinkMutationSchema=z.union([
 z.object({action:z.literal('create'),actionId:id,target:z.literal('invoice'),draftId:id,expiresInDays:z.number().int().min(1).max(60),methods:paymentMethodsSchema,language:z.enum(['es','en'])}).strict(),
 z.object({action:z.literal('create'),actionId:id,target:z.literal('installment'),planId:id,planRevision:z.number().int().positive(),seq:z.number().int().min(0).max(1000),expiresInDays:z.number().int().min(1).max(60),methods:paymentMethodsSchema,language:z.enum(['es','en'])}).strict(),
 z.object({action:z.literal('cancel'),actionId:id,linkId:id,reason:z.string().trim().min(1).max(160)}).strict(),
 z.object({action:z.literal('refund'),actionId:id,transactionId:id,reason:z.string().trim().min(1).max(160)}).strict(),
]);
export const reconciliationRowSchema=z.object({attemptId:id,processorRef:z.string(),provider:z.string(),mode:z.enum(['mock','sandbox','production']),method:z.enum(['card','sinpe']),status:z.string(),amountCents:z.number().int(),
 cardLast4:z.string().nullable(),sinpeReference:z.string().nullable(),failureCode:z.string().nullable(),description:z.string(),target:z.enum(['invoice','installment']),draftId:id.nullable(),planId:id.nullable(),workId:z.string(),
 linkStatus:z.string(),entryId:anyUuid.nullable(),transactionId:id.nullable(),refundEntryId:anyUuid.nullable(),refundRequested:z.boolean(),review:z.string().nullable(),reconciliation:z.enum(['matched','refunded','exception','pending','failed']),at:z.string()});
export type ReconciliationRow=z.infer<typeof reconciliationRowSchema>;
export const reconciliationSchema=z.object({items:z.array(reconciliationRowSchema),summary:z.object({receivedCents:z.number(),bookedCents:z.number(),refundedCents:z.number(),exceptions:z.number(),pending:z.number(),failed:z.number()})});
// Public hosted page.
export const paymentPublicViewSchema=z.object({status:z.enum(['active','paid','cancelled','expired']),amountCents:z.number().int(),currency:z.literal('CRC'),description:z.string(),businessName:z.string(),
 methods:z.array(z.enum(['card','sinpe'])),mode:z.enum(['mock','sandbox','production']),expiresAt:z.string(),paidAt:z.string().nullable(),
 openAttempt:z.object({id,method:z.enum(['card','sinpe']),status:z.enum(['pending','requires_action'])}).nullable(),lastFailure:z.string().nullable(),
 sinpe:z.object({phone:z.string(),code:z.string()}).nullable().optional()});
export type PaymentPublicView=z.infer<typeof paymentPublicViewSchema>;
export const paymentPublicSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('view'),token:paymentLinkTokenSchema}).strict(),
 z.object({action:z.literal('card'),token:paymentLinkTokenSchema,attemptId:id,card:z.object({number:z.string().regex(/^[\d ]{13,23}$/),expMonth:z.number().int().min(1).max(12),expYear:z.number().int().min(2000).max(2100),cvc:z.string().regex(/^\d{3,4}$/),name:z.string().trim().min(2).max(80)}).strict()}).strict(),
 z.object({action:z.literal('verify'),token:paymentLinkTokenSchema,attemptId:id,approve:z.boolean()}).strict(),
 z.object({action:z.literal('sinpe'),token:paymentLinkTokenSchema,attemptId:id,reference:z.string().trim().regex(/^\d{8,25}$/)}).strict(),
]);
export const PAYMENT_FAILURES:Record<string,{es:string;en:string}>={
 card_declined:{es:'El banco rechazó la tarjeta. Pruebe con otra tarjeta o con SINPE Móvil.',en:'The bank declined the card. Try another card or SINPE Móvil.'},
 insufficient_funds:{es:'Fondos insuficientes. Pruebe con otra tarjeta o con SINPE Móvil.',en:'Insufficient funds. Try another card or SINPE Móvil.'},
 expired_card:{es:'La tarjeta está vencida.',en:'The card has expired.'},invalid_card:{es:'Revise el número, la fecha y el código de la tarjeta.',en:'Check the card number, date and code.'},
 authentication_failed:{es:'No se completó la verificación del banco.',en:'Bank verification was not completed.'},
 sinpe_not_found:{es:'No encontramos esa transferencia SINPE Móvil. Revise el número de comprobante.',en:'We could not find that SINPE Móvil transfer. Check the confirmation number.'},
 invalid_reference:{es:'El número de comprobante SINPE debe tener de 8 a 25 dígitos.',en:'The SINPE confirmation number must have 8–25 digits.'},
 amount_mismatch:{es:'El procesador informó un monto o una moneda distintos a los de este enlace. No se registró el pago; el negocio lo revisará.',en:'The processor reported a different amount or currency for this link. The payment was not booked; the business will review it.'},
 processor_unavailable:{es:'El procesador no está disponible. Intente más tarde.',en:'The processor is unavailable. Try later.'},
};
/** Short code the payer writes in the SINPE Móvil description (derived from the link token, not secret). */
export const sinpeCodeFrom=(tokenHash:string)=>'CCR-'+tokenHash.slice(0,6).toUpperCase();
