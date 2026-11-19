import {z} from 'zod';
import {emisorSettingsSchema} from './document';

/** Round 6A: request/response contracts of /api/pro/einvoice (shared by route and UI). */
export const einvoiceStatusSchema=z.enum(['borrador','firmado','enviado','recibido','procesando','aceptado','rechazado','error']);
/** Ronda F2-A: one adapter call recorded by the pipeline (pro_einvoice_provider_responses). */
export const einvoiceResponseSchema=z.object({provider:z.enum(['mock','hacienda-sandbox','gti']),mode:z.enum(['mock','sandbox','production']),operation:z.enum(['issue','status','receiver_message','receiver_status']),attempt:z.number().int(),httpStatus:z.number().int().nullable(),outcome:z.enum(['received','duplicate','error','timeout','state']),state:z.string().nullable(),message:z.string().nullable(),at:z.string()});
export type EinvoiceResponse=z.infer<typeof einvoiceResponseSchema>;
export type EinvoiceStatus=z.infer<typeof einvoiceStatusSchema>;
export const einvoiceDocumentSchema=z.object({
 id:z.string().uuid(),draftId:z.string().uuid(),docType:z.enum(['01','02','03','04']),mode:z.enum(['mock','sandbox','production']),provider:z.enum(['mock','hacienda-sandbox','gti']).default('mock'),clave:z.string().regex(/^\d{3}\d{6}[A-Za-z0-9]{12}\d{20}[123]\d{8}$/),consecutivo:z.string().regex(/^\d{20}$/),
 issuedAt:z.string(),status:einvoiceStatusSchema,responseCode:z.number().int().nullable(),responseMessage:z.string().nullable(),totalCents:z.number().int(),taxCents:z.number().int(),
 receiverName:z.string().nullable(),referenceDocumentId:z.string().uuid().nullable(),referenceCode:z.string().nullable(),referenceReason:z.string().nullable(),
 attempts:z.number().int(),nextAttemptAt:z.string().nullable(),lastError:z.string().nullable(),signer:z.enum(['mock','p12']).nullable(),hasXml:z.boolean(),hasResponse:z.boolean(),
 createdAt:z.string(),updatedAt:z.string(),events:z.array(z.object({from:z.string().nullable(),to:z.string(),detail:z.record(z.string(),z.unknown()),at:z.string()})),
 xmlSha256:z.string().nullable().default(null),responses:z.array(einvoiceResponseSchema).default([]),
});
export type EinvoiceDocument=z.infer<typeof einvoiceDocumentSchema>;
export const einvoiceReadSchema=z.object({
 settings:emisorSettingsSchema.nullable(),settingsRevision:z.number().int(),draftRevision:z.number().int(),draftTotalCents:z.number().int(),
 documents:z.array(einvoiceDocumentSchema),credited:z.record(z.string(),z.number()),debited:z.record(z.string(),z.number()).default({}),
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

/** Ronda F2-A: /api/pro/invoice-einvoice (pipeline behind the provider adapter; owner, Administrador, Gerente). */
export const einvoiceReceiverSchema=z.object({
 id:z.string().uuid(),receivedClave:z.string().regex(/^506\d{6}[A-Za-z0-9]{12}\d{20}[123]\d{8}$/),emisorIdType:z.string(),emisorId:z.string(),emisorName:z.string(),receivedIssuedAt:z.string(),
 receivedTotalCents:z.number().int(),receivedTaxCents:z.number().int(),messageCode:z.enum(['1','2','3']),docType:z.enum(['05','06','07']),detail:z.string().nullable(),taxCondition:z.string().nullable(),
 creditTaxCents:z.number().int().nullable(),expenseCents:z.number().int().nullable(),activityCode:z.string(),consecutivo:z.string().regex(/^\d{8}(05|06|07)\d{10}$/),mode:z.enum(['mock','sandbox','production']),
 provider:z.enum(['mock','hacienda-sandbox','gti']),status:einvoiceStatusSchema,responseCode:z.number().int().nullable(),responseMessage:z.string().nullable(),attempts:z.number().int(),
 nextAttemptAt:z.string().nullable(),lastError:z.string().nullable(),hasXml:z.boolean(),hasResponse:z.boolean(),createdAt:z.string(),updatedAt:z.string(),
 events:z.array(z.object({from:z.string().nullable(),to:z.string(),detail:z.record(z.string(),z.unknown()),at:z.string()})),responses:z.array(einvoiceResponseSchema),
});
export type EinvoiceReceiverMessage=z.infer<typeof einvoiceReceiverSchema>;
export const einvoicePipelineInfoSchema=z.object({provider:z.enum(['mock','hacienda-sandbox','gti']),mode:z.enum(['mock','sandbox','production']),test:z.boolean(),
 env:z.object({provider:z.enum(['mock','hacienda-sandbox','gti']),mode:z.enum(['mock','sandbox','live']),status:z.enum(['ready','refused']),missing:z.array(z.string())})});
export type EinvoicePipelineInfo=z.infer<typeof einvoicePipelineInfoSchema>;
export const einvoicePipelineReadSchema=einvoiceReadSchema.extend({pipeline:einvoicePipelineInfoSchema});
export type EinvoicePipelineRead=z.infer<typeof einvoicePipelineReadSchema>;
export const einvoiceReceiverReadSchema=z.object({messages:z.array(einvoiceReceiverSchema),pipeline:einvoicePipelineInfoSchema,settingsReady:z.boolean()});
const cents=z.number().int().min(0).max(10000000000);
export const einvoicePipelineMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('emit'),actionId:z.string().uuid(),draftId:z.string().uuid(),docType:z.enum(['01','04'])}).strict(),
 z.object({action:z.literal('poll'),actionId:z.string().uuid(),documentId:z.string().uuid()}).strict(),
 z.object({action:z.literal('credit_note'),actionId:z.string().uuid(),draftId:z.string().uuid(),originalId:z.string().uuid(),code:z.enum(['01','02']),reason:z.string().trim().min(5).max(180),lines:z.array(z.number().int().min(1).max(1000)).max(1000)}).strict(),
 z.object({action:z.literal('debit_note'),actionId:z.string().uuid(),draftId:z.string().uuid(),originalId:z.string().uuid(),reason:z.string().trim().min(5).max(180),lineNumber:z.number().int().min(1).max(1000),amount:z.string().trim().regex(/^\d{1,13}(\.\d{1,5})?$/),detail:z.string().trim().max(200).optional()}).strict(),
 z.object({action:z.literal('receiver_message'),actionId:z.string().uuid(),receivedClave:z.string(),emisorIdType:z.string(),emisorId:z.string(),emisorName:z.string(),receivedIssuedAt:z.string(),receivedTotalCents:cents,receivedTaxCents:cents,
  messageCode:z.enum(['1','2','3']),detail:z.string(),taxCondition:z.string(),creditTaxCents:cents.nullable(),expenseCents:cents.nullable()}).strict(),
 z.object({action:z.literal('receiver_poll'),actionId:z.string().uuid(),messageId:z.string().uuid()}).strict(),
]);
export type EinvoicePipelineMutation=z.infer<typeof einvoicePipelineMutationSchema>;
