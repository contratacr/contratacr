import {z} from 'zod';
import {emisorSettingsSchema} from './document';

/** Round 6A: request/response contracts of /api/pro/einvoice (shared by route and UI). */
export const einvoiceStatusSchema=z.enum(['borrador','firmado','enviado','recibido','aceptado','rechazado','error']);
export type EinvoiceStatus=z.infer<typeof einvoiceStatusSchema>;
export const einvoiceDocumentSchema=z.object({
 id:z.string().uuid(),draftId:z.string().uuid(),docType:z.enum(['01','03','04']),mode:z.enum(['mock','sandbox','production']),clave:z.string().regex(/^\d{3}\d{6}[A-Za-z0-9]{12}\d{20}[123]\d{8}$/),consecutivo:z.string().regex(/^\d{20}$/),
 issuedAt:z.string(),status:einvoiceStatusSchema,responseCode:z.number().int().nullable(),responseMessage:z.string().nullable(),totalCents:z.number().int(),taxCents:z.number().int(),
 receiverName:z.string().nullable(),referenceDocumentId:z.string().uuid().nullable(),referenceCode:z.string().nullable(),referenceReason:z.string().nullable(),
 attempts:z.number().int(),nextAttemptAt:z.string().nullable(),lastError:z.string().nullable(),signer:z.enum(['mock','p12']).nullable(),hasXml:z.boolean(),hasResponse:z.boolean(),
 createdAt:z.string(),updatedAt:z.string(),events:z.array(z.object({from:z.string().nullable(),to:z.string(),detail:z.record(z.string(),z.unknown()),at:z.string()})),
});
export type EinvoiceDocument=z.infer<typeof einvoiceDocumentSchema>;
export const einvoiceReadSchema=z.object({
 settings:emisorSettingsSchema.nullable(),settingsRevision:z.number().int(),draftRevision:z.number().int(),draftTotalCents:z.number().int(),
 documents:z.array(einvoiceDocumentSchema),credited:z.record(z.string(),z.number()),
 mode:z.enum(['mock','sandbox','production']),modeStatus:z.enum(['ready','missing_keys','production_refused','disabled']),
 issues:z.object({'01':z.array(z.object({field:z.string(),es:z.string(),en:z.string()})),'04':z.array(z.object({field:z.string(),es:z.string(),en:z.string()}))}),
 originalLines:z.record(z.string(),z.array(z.object({number:z.number().int(),detail:z.string(),lineTotal:z.string()}))),
});
export type EinvoiceRead=z.infer<typeof einvoiceReadSchema>;
export const einvoiceSettingsReadSchema=z.object({settings:emisorSettingsSchema.nullable(),settingsRevision:z.number().int(),defaults:z.record(z.string(),z.string())});
export const einvoiceMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save_settings'),actionId:z.string().uuid(),revision:z.number().int().min(0),settings:emisorSettingsSchema}).strict(),
 z.object({action:z.literal('emit'),actionId:z.string().uuid(),draftId:z.string().uuid(),docType:z.enum(['01','04'])}).strict(),
 z.object({action:z.literal('poll'),actionId:z.string().uuid(),documentId:z.string().uuid()}).strict(),
 z.object({action:z.literal('credit_note'),actionId:z.string().uuid(),draftId:z.string().uuid(),originalId:z.string().uuid(),code:z.enum(['01','02']),reason:z.string().trim().min(5).max(180),lines:z.array(z.number().int().min(1).max(1000)).max(1000)}).strict(),
]);
export type EinvoiceMutation=z.infer<typeof einvoiceMutationSchema>;
