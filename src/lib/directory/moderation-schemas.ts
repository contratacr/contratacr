import {z} from 'zod';
import {CLAIM_DOCUMENT_KINDS} from './claim-schemas';
import {DIRECTORY_VERTICALS} from './types';

// LOCAL PRO ONLY (multivertical M1). zod mirrors of directory-moderation-local.sql (the database checks again):
// staff queue decisions, review flags, owner replies with revision, public price reports and claim documents.
// Every staff decision carries a reason (3..1000) except approvals/publications, where it is optional.

const uuid=z.string().uuid();
const reason=z.string().trim().min(3).max(1000);
const optionalReason=z.string().trim().max(1000).optional();

export const STAFF_QUEUES=['claims','reviews','prices','reports','pharmacies','log'] as const;
export type StaffQueue=typeof STAFF_QUEUES[number];

const placeFix=z.object({
 name:z.string().trim().min(2).max(160).optional(),addressLine:z.string().trim().max(300).nullable().optional(),locality:z.string().trim().max(80).nullable().optional(),
 adminArea1:z.string().trim().max(80).nullable().optional(),adminArea2:z.string().trim().max(80).nullable().optional(),adminArea3:z.string().trim().max(80).nullable().optional(),
 phone:z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,22}$/).nullable().optional(),website:z.string().trim().regex(/^https?:\/\/[^\s"<>]{3,}$/).max(500).nullable().optional(),
 // 2026-11-17: business e-mail (claim code destination, never public). Same check as dir_places.email.
 email:z.string().trim().toLowerCase().max(254).regex(/^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/,'Correo inválido.').nullable().optional(),
}).strict().refine(v=>Object.keys(v).length>0,'Indique al menos un dato.');

/** Browser → /api/admin/directorio (POST). The route adds nothing: these are the exact SQL inputs plus `kind`. */
export const staffDecisionSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('claim'),actionId:uuid,claimId:uuid,decision:z.enum(['approve','reject']),reason:optionalReason}).strict()
  .refine(v=>v.decision==='approve'||(v.reason?.length??0)>=3,{path:['reason'],message:'Indique el motivo.'}),
 z.object({kind:z.literal('review'),actionId:uuid,reviewId:uuid,target:z.enum(['review','reply']),decision:z.enum(['hide','restore','dismiss']),reason,expectedStatus:z.enum(['published','hidden'])}).strict(),
 z.object({kind:z.literal('price'),actionId:uuid,observationId:uuid,decision:z.enum(['publish','reject']),reason:optionalReason,expectedStatus:z.enum(['pending','published'])}).strict()
  .refine(v=>v.decision==='publish'||(v.reason?.length??0)>=3,{path:['reason'],message:'Indique el motivo.'}),
 z.object({kind:z.literal('report'),actionId:uuid,reportId:uuid,decision:z.enum(['fix','hide','close','remove','recategorize','reject']),reason,
  revision:z.number().int().positive().optional(),place:placeFix.optional(),vertical:z.enum(DIRECTORY_VERTICALS).optional()}).strict()
  .refine(v=>(v.place!==undefined)===(v.decision==='fix')&&(v.vertical!==undefined)===(v.decision==='recategorize')&&(v.decision==='reject'||v.revision!==undefined),{message:'Datos incompletos.'}),
 z.object({kind:z.literal('permit'),actionId:uuid,placeId:uuid,revision:z.number().int().positive(),permitNumber:z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9 ./-]{2,39}$/,'Número de permiso inválido.'),
  authority:z.string().trim().min(2).max(120).optional(),evidence:z.object({kind:z.enum(['document','official_registry','inspection']),reference:z.string().trim().min(3).max(300),note:z.string().trim().max(500).optional()}).strict()}).strict(),
]);
export type StaffDecision=z.infer<typeof staffDecisionSchema>;
export const STAFF_DECISION_RPC={claim:'dir_admin_claim_decide',review:'dir_admin_review_moderate',price:'dir_admin_price_moderate',report:'dir_admin_report_resolve',permit:'dir_admin_pharmacy_verify'} as const;

export const REVIEW_FLAG_REASONS=['spam','offensive','fake','conflict_of_interest','private_info','other'] as const;
export const REVIEW_FLAG_LABELS:Record<typeof REVIEW_FLAG_REASONS[number],[string,string]>={
 spam:['Publicidad o spam','Advertising or spam'],offensive:['Lenguaje ofensivo o amenazas','Offensive language or threats'],
 fake:['Parece falsa o de alguien que no fue cliente','Looks fake or not from a real customer'],conflict_of_interest:['La escribió el negocio o su competencia','Written by the business or a competitor'],
 private_info:['Incluye datos personales','Contains personal data'],other:['Otro motivo','Other reason'],
};
/** Browser → /api/lugar/<slug>/resenas/reporte. visitorHash is added by the server for people without an account. */
export const reviewFlagSchema=z.object({flagId:uuid,reviewId:uuid,reason:z.enum(REVIEW_FLAG_REASONS),message:z.string().trim().max(500).optional()}).strict()
 .refine(v=>v.reason!=='other'||(v.message?.length??0)>=5,{path:['message'],message:'Describa el motivo.'});

/** Browser → /api/pro/review-replies (create: replyRevision 0; edit: the revision shown). */
export const reviewReplyWriteSchema=z.object({actionId:uuid,reviewId:uuid,replyRevision:z.number().int().min(0),
 reply:z.string().trim().min(1,'Escriba la respuesta.').max(1000).refine(v=>!/(https?:\/\/|www\.)/i.test(v),'La respuesta no puede incluir enlaces.')}).strict();

/** Browser → /api/lugar/<slug>/precios/reporte. observedOn = day the person saw the price (Costa Rica calendar). */
export const priceReportSchema=z.object({actionId:uuid,itemSlug:z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/),
 price:z.number().positive().max(99_999_999).refine(v=>Math.round(v*100)===v*100,'Use hasta dos decimales.'),
 observedOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict();
/** Item kinds a person may report at each kind of place (fuel is national: ARESEP only; medicine never with Rx). */
// Restaurants publish their prices in the menu (P2), so they get no user report form.
// 2026-11-17: corner stores and hardware stores like supermarkets (never medicine); vets/pet shops only pet-shop
// products (grocery/generic, never medicine). No form at banks (map only), health places, lodging, tours, etc.
export const PRICE_REPORT_KINDS:Record<string,readonly ('grocery'|'medicine'|'generic')[]>={pharmacy:['medicine','grocery','generic'],grocery:['grocery','medicine','generic'],
 convenience:['grocery','generic'],hardware:['generic'],vet_pets:['grocery','generic']};

/** Browser → /api/lugar/<slug>/reclamo for staff-reviewed methods (the server builds the Hacienda evidence). */
export const claimHaciendaRequestSchema=z.object({actionId:uuid,claimId:uuid,method:z.literal('hacienda_juridica'),
 cedula:z.string().trim().transform(v=>v.replace(/[\s-]/g,'')).pipe(z.string().regex(/^3\d{9}$/,'Cédula jurídica inválida.')),
 legalName:z.string().trim().min(2).max(300),note:z.string().trim().max(1000).optional()}).strict();
export const claimDocumentsRequestSchema=z.object({actionId:uuid,claimId:uuid,method:z.literal('document_review'),
 documents:z.array(z.object({kind:z.enum(CLAIM_DOCUMENT_KINDS),path:z.string().max(160)}).strict()).min(1).max(5),note:z.string().trim().max(1000).optional()}).strict();
export const CLAIM_DOCUMENT_LABELS:Record<typeof CLAIM_DOCUMENT_KINDS[number],[string,string]>={
 municipal_license:['Patente municipal','Municipal business license'],legal_personhood:['Personería jurídica','Certificate of legal standing'],
 health_permit:['Permiso sanitario de funcionamiento','Health operating permit'],utility_bill:['Recibo de servicio a nombre del negocio','Utility bill in the business name'],other:['Otro documento','Other document'],
};
