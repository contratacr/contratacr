import {z} from 'zod';
import {placeFieldsSchema} from './schemas';

// LOCAL PRO ONLY (multivertical F3). zod mirrors of directory-claims-local.sql; the database checks again.
// Claiming and verifying a place is free: there is no commercial field in any of these inputs.
// Not imported by any route yet: wiring is listed in the F3/F5 wiring notes.

export const CLAIM_METHODS=['phone_listed','email_listed','hacienda_juridica','document_review','email_domain'] as const;
export type ClaimMethod=typeof CLAIM_METHODS[number];
export const CLAIM_STATUSES=['open','code_sent','approved','rejected','expired','withdrawn'] as const;
export type ClaimStatus=typeof CLAIM_STATUSES[number];
export const PLACE_CLAIM_STATUSES=['unclaimed','claim_pending','claimed','disputed'] as const;
export type PlaceClaimStatus=typeof PLACE_CLAIM_STATUSES[number];
export const CLAIM_DOCUMENT_KINDS=['municipal_license','legal_personhood','health_permit','utility_bill','other'] as const;
/** Level a place reaches when a claim with this method is approved (never lowers; never license_verified). */
export const CLAIM_METHOD_LEVEL={phone_listed:'claimed',email_listed:'claimed',email_domain:'claimed',hacienda_juridica:'verified',document_review:'verified'} as const satisfies Record<ClaimMethod,string>;
/** Methods approved by a one-time code. phone_listed (SMS) is off unless DIR_CLAIM_SMS_ENABLED (feature-flags.ts). */
export const CODE_METHODS=['phone_listed','email_listed','email_domain'] as const satisfies readonly ClaimMethod[];
/** Methods decided by staff (no self-approval); the others are approved by the one-time code. */
export const STAFF_REVIEWED_METHODS=['hacienda_juridica','document_review'] as const satisfies readonly ClaimMethod[];
export const CLAIM_LIMITS={codeLength:6,codeTtlMinutes:10,maxSends:3,resendSeconds:60,maxAttempts:5,claimsPerDay:5,claimsPerPlace30d:3,signupsPerDay:3,maxDocuments:5,maxManagers:10} as const;

/** Same list as the database: an address on a free mailbox does not prove control of the business domain. */
export const FREE_MAIL_DOMAINS=['gmail.com','hotmail.com','hotmail.es','outlook.com','outlook.es','live.com','msn.com','yahoo.com','yahoo.es','icloud.com','me.com','aol.com','proton.me','protonmail.com','gmx.com','mail.com','facebook.com','instagram.com','wa.me','linktr.ee'] as const;

const uuid=z.string().uuid();
const slug=z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/);
const note=z.string().trim().min(1).max(1000).optional();
const email=z.string().trim().toLowerCase().max(254).regex(/^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/,'Correo inválido.')
 .refine(v=>!(FREE_MAIL_DOMAINS as readonly string[]).includes(v.split('@')[1]),'Use un correo del dominio del sitio web del negocio.');

const documentEvidence=(claimId:string)=>z.object({documents:z.array(z.object({
 kind:z.enum(CLAIM_DOCUMENT_KINDS),
 path:z.string().regex(/^dir-claims\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100}$/).refine(p=>p.startsWith(`dir-claims/${claimId}/`),'Documento de otra solicitud.'),
}).strict()).min(1,'Adjunte al menos un documento.').max(CLAIM_LIMITS.maxDocuments)}).strict();
/** Built by the server from HaciendaIdentityVerifier (never typed by the claimant). */
export const haciendaEvidenceSchema=z.object({hacienda:z.object({
 cedula:z.string().regex(/^3\d{9}$/,'Cédula jurídica inválida.'),officialName:z.string().min(2).max(300),
 score:z.number().min(0.6).max(1),matched:z.literal(true),provider:z.literal('hacienda_api'),checkedAt:z.string().datetime().optional(),
}).strict()}).strict();

const base={actionId:uuid,claimId:uuid,slug,note};
/**
 * dir_claim_open. phone_listed carries NO phone: the code always goes to the phone already on the place.
 * email_listed carries NO address: the code always goes to the e-mail already on the place (any domain; the claimant
 * only sees it masked). The database refuses it when that e-mail changed in the last 30 days by someone who is not
 * staff nor a verified owner.
 * email_domain: the address must belong to the listed website domain (checked again by the database).
 */
export const claimOpenSchema=z.discriminatedUnion('method',[
 z.object({...base,method:z.literal('phone_listed')}).strict(),
 z.object({...base,method:z.literal('email_listed')}).strict(),
 z.object({...base,method:z.literal('email_domain'),email}).strict(),
 z.object({...base,method:z.literal('document_review'),dispute:z.boolean().optional(),evidence:z.unknown()}).strict(),
 z.object({...base,method:z.literal('hacienda_juridica'),dispute:z.boolean().optional(),evidence:haciendaEvidenceSchema}).strict(),
]).superRefine((v,ctx)=>{
 if(v.method==='document_review'&&!documentEvidence(v.claimId).safeParse(v.evidence).success)ctx.addIssue({code:'custom',path:['evidence'],message:'Documentos inválidos.'});
});
export type ClaimOpenInput=z.infer<typeof claimOpenSchema>;

/** Browser → route: only ids. The route generates the code, hashes it and sends it through the adapter. */
export const claimSendCodeSchema=z.object({actionId:uuid,claimId:uuid}).strict();
/** Browser → route: the typed code; the route hashes it before calling dir_claim_verify_code. */
export const claimVerifyCodeSchema=z.object({actionId:uuid,claimId:uuid,code:z.string().trim().regex(/^\d{6}$/,'Escriba los 6 dígitos.')}).strict();
export const claimWithdrawSchema=z.object({actionId:uuid,claimId:uuid}).strict();
/** Staff only (admin + MFA at the route). Rejections need a reason the claimant will read. */
export const claimReviewSchema=z.object({actionId:uuid,claimId:uuid,decision:z.enum(['approve','reject']),reason:z.string().trim().max(1000).optional()}).strict()
 .refine(v=>v.decision==='approve'||(v.reason?.length??0)>=3,{path:['reason'],message:'Indique el motivo.'});

/** "Add my business": new draft place + staff-reviewed claim. Phone/website typed here never enable code methods. */
export const placeSelfSignupSchema=z.object({
 actionId:uuid,claimId:uuid,placeId:uuid,note,
 place:placeFieldsSchema.required({slug:true,vertical:true,name:true}).strict(),
 method:z.enum(STAFF_REVIEWED_METHODS),evidence:z.unknown(),
}).strict().superRefine((v,ctx)=>{
 const ok=v.method==='document_review'?documentEvidence(v.claimId).safeParse(v.evidence).success:haciendaEvidenceSchema.safeParse(v.evidence).success;
 if(!ok)ctx.addIssue({code:'custom',path:['evidence'],message:'Evidencia inválida.'});
});

export const placeManagerMutationSchema=z.object({actionId:uuid,placeId:uuid,action:z.enum(['add','revoke']),userId:uuid}).strict();

/** dir_claim_options (claim block on the place page): never the full e-mail, phone or any id. */
export type ClaimOptions={emailListed:string|null;websiteHost:string|null;phoneListed:boolean;smsEnabled:boolean};

/** dir_claim_read (claimant view). */
export type ClaimView={
 claimId:string;slug:string;placeName:string;method:ClaimMethod;status:ClaimStatus;isDispute:boolean;selfSignup:boolean;
 destinationMasked:string|null;attemptsLeft:number;sendsLeft:number;codeExpiresAt:string|null;expiresAt:string;
 decisionReason:string|null;createdAt:string;resolvedAt:string|null;
};
