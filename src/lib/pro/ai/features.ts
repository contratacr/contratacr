import {z} from 'zod';
import {expensePaymentMethods} from '../expenses';

/**
 * Round 6C: AI assistant contract shared by the routes and the UI (safe in the browser).
 * Every AI result is a SUGGESTION: it is stored apart (pro_ai_suggestions, immutable) and only reaches a job
 * record when the owner reviews/edits it and saves it through the existing editor. Nothing here writes data.
 */
export const aiDraftFeatures=['quote_line','contract_clause','daily_log','client_update'] as const;
export type AiDraftFeature=typeof aiDraftFeatures[number];
export const aiFeatures=[...aiDraftFeatures,'takeoff','expense_receipt','expense_voice','meeting'] as const;
export type AiFeature=typeof aiFeatures[number];
/** Consent text shown in Company › Integraciones; its version is stored with the owner's decision. */
export const AI_CONSENT_VERSION='2026-11-13';
export const aiConsentText={
 es:'Autorizo que ContrataCR envíe a los proveedores de IA y de transcripción configurados (Anthropic y el servicio de transcripción) solo los datos necesarios del trabajo, documentos, fotos o audio que yo elija para generar sugerencias. Las sugerencias no se guardan solas: las reviso y edito antes de guardarlas. Puedo retirar esta autorización en cualquier momento. Antes de grabar una reunión o llamada informaré a todas las personas participantes y obtendré su consentimiento.',
 en:'I authorize ContrataCR to send to the configured AI and transcription providers (Anthropic and the transcription service) only the job data, documents, photos or audio I choose, to generate suggestions. Suggestions are never saved on their own: I review and edit them before saving. I can withdraw this authorization at any time. Before recording a meeting or call I will inform everyone taking part and obtain their consent.',
};
export const meetingConsentText={
 es:'Confirmo que informé a todas las personas de la reunión o llamada que se está grabando y para qué, y que todas dieron su consentimiento.',
 en:'I confirm I told everyone in the meeting or call that it is being recorded and why, and that all of them consented.',
};
export const AI_MONTHLY_LIMIT_DEFAULT=100,AI_MONTHLY_LIMIT_MAX=5000;
export const AI_IMAGE_MAX_BYTES=5*1024*1024,AI_AUDIO_MAX_BYTES=8*1024*1024;
export const aiImageTypes=['image/jpeg','image/png','image/webp'] as const;
export const aiAudioTypes=['audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/aac','audio/x-m4a'] as const;
/** Browsers add codec parameters («audio/webm;codecs=opus»); only the base type matters. */
export const baseMime=(value:string)=>value.split(';')[0]!.trim().toLowerCase();

const shortText=(max:number)=>z.string().trim().max(max);
export const aiDraftInputSchema=z.object({
 title:shortText(200).default(''),current:shortText(2000).default(''),notes:shortText(4000).default(''),
 lines:z.array(shortText(300)).max(30).default([]),
}).strict();
export const aiSettingsMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('set_consent'),actionId:z.string().uuid(),revision:z.number().int().min(0),consent:z.boolean(),consentVersion:z.literal(AI_CONSENT_VERSION)}).strict(),
 z.object({action:z.literal('set_limit'),actionId:z.string().uuid(),revision:z.number().int().min(0),monthlyLimit:z.number().int().min(1).max(AI_MONTHLY_LIMIT_MAX)}).strict(),
]);
export const aiJsonMutationSchema=z.union([
 aiSettingsMutationSchema,
 z.object({action:z.literal('suggest'),actionId:z.string().uuid(),feature:z.enum(aiDraftFeatures),workId:z.string().trim().min(1).max(160).nullable(),language:z.enum(['es','en']),input:aiDraftInputSchema}).strict(),
 z.object({action:z.literal('read_plan'),actionId:z.string().uuid(),workId:z.string().trim().min(1).max(160),planId:z.string().uuid(),pageNumber:z.number().int().min(1).max(200),language:z.enum(['es','en'])}).strict(),
 z.object({action:z.literal('review'),id:z.string().uuid(),outcome:z.enum(['used','discarded'])}).strict(),
]);
export type AiJsonMutation=z.infer<typeof aiJsonMutationSchema>;

// ---------- outputs (validated again after every provider call; anything else is discarded) ----------
export const aiTextOutputSchema=z.object({text:z.string().trim().min(1).max(4000)}).strict();
export const takeoffSuggestionSchema=z.object({
 name:z.string().trim().min(1).max(120),kind:z.enum(['area','length','count']),quantity:z.number().positive().max(1000000),
 unit:z.enum(['m2','m','u']),confidence:z.enum(['low','medium','high']),note:z.string().trim().max(300).default(''),
}).strict().refine(item=>item.unit===(item.kind==='area'?'m2':item.kind==='length'?'m':'u'),'unit');
export const aiTakeoffOutputSchema=z.object({items:z.array(takeoffSuggestionSchema).max(30),warnings:z.array(z.string().trim().max(300)).max(10)}).strict();
export const aiExpenseOutputSchema=z.object({
 vendor:z.string().trim().max(160),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),totalAmount:z.number().positive().max(100000000).nullable(),
 vatRateBps:z.union([z.literal(1300),z.literal(400),z.literal(200),z.literal(100),z.literal(50)]).nullable(),
 vatAmount:z.number().nonnegative().max(100000000).nullable(),paymentMethod:z.enum(expensePaymentMethods).nullable(),concept:z.string().trim().max(300),
 confidence:z.enum(['low','medium','high']),
}).strict();
export const aiMeetingOutputSchema=z.object({
 summary:z.string().trim().min(1).max(4000),
 actionItems:z.array(z.object({text:z.string().trim().min(1).max(160),dueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()}).strict()).max(20),
 decisions:z.array(z.string().trim().min(1).max(300)).max(20),
}).strict();
export type AiTakeoffOutput=z.infer<typeof aiTakeoffOutputSchema>;
export type AiExpenseOutput=z.infer<typeof aiExpenseOutputSchema>;
export type AiMeetingOutput=z.infer<typeof aiMeetingOutputSchema>;
export type AiTextOutput=z.infer<typeof aiTextOutputSchema>;
export const transcriptSchema=z.object({text:z.string().trim().min(1).max(60000),language:z.string().max(10),durationSeconds:z.number().nonnegative().max(36000).nullable()}).strict();
export type Transcript=z.infer<typeof transcriptSchema>;

export type AiSettings={consent:boolean;consentVersion:string|null;consentAt:string|null;monthlyLimit:number;revision:number;usage:{month:string;used:number;remaining:number;byFeature:Record<string,number>}};
export type AiSuggestion={id:string;feature:AiFeature;provider:'ai'|'transcription';mode:'mock'|'sandbox'|'production';model:string;workId:string|null;status:'pending'|'ready'|'failed';output:unknown;review:'used'|'discarded'|null;createdAt:string};
/** Visible label on every AI result (the owner must always know the text came from the assistant). */
export const aiLabel={es:'Generado con IA · revise y edite antes de guardar',en:'AI-generated · review and edit before saving'};
export const aiErrorCopy:Record<string,{es:string;en:string}>={
 consent_required:{es:'Active primero la autorización de uso de IA en Empresa › Configuración › Integraciones.',en:'First turn on the AI data-processing authorization in Company › Settings › Integrations.'},
 cap_reached:{es:'Se alcanzó el límite mensual de uso de IA de su empresa. Puede ampliarlo en Integraciones.',en:'Your company reached its monthly AI usage limit. You can raise it in Integrations.'},
 missing_keys:{es:'Faltan las claves del proveedor de IA en el servidor.',en:'The AI provider keys are missing on the server.'},
 production_refused:{es:'Producción no está permitida en este servidor.',en:'Production is not allowed on this server.'},
 disabled:{es:'El asistente de IA está desactivado.',en:'The AI assistant is turned off.'},
 provider_failed:{es:'El proveedor no devolvió una sugerencia válida. No se guardó nada; puede reintentar.',en:'The provider did not return a valid suggestion. Nothing was saved; you can retry.'},
 unsupported_file:{es:'Use una foto JPG, PNG o WebP (máx. 5 MB) o un audio de hasta 8 MB.',en:'Use a JPG, PNG or WebP photo (max 5 MB) or audio up to 8 MB.'},
 consent_meeting:{es:'Confirme que todas las personas fueron informadas y dieron su consentimiento.',en:'Confirm everyone was informed and consented.'},
 plan_unavailable:{es:'El plano no está disponible.',en:'The plan is not available.'},
};
