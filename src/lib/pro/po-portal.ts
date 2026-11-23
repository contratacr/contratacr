import {z} from 'zod';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';

/**
 * Secure vendor link of a purchase order (family 51, migration 410). A vendor WITHOUT a ContrataCR account confirms, declines or proposes
 * a delivery date through a single-use link; an own vendor account is not built (product decision 2026-11-23). Same model as the bid
 * vendor portal (bid-portal.ts): only keyed hashes of the random link and session tokens are stored (PRO_BID_PORTAL_SECRET, kinds
 * 'po-link' / 'po-session' / 'po-device'), one httpOnly session cookie per link, nothing is e-mailed (the owner copies the link).
 */
const id=z.string().uuid();
const workId=z.string().trim().min(1).max(160);
const revision=z.number().int().min(1).max(2147483646);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const stamp=z.string().min(1);
const cents=z.number().int();
export const PO_PORTAL_BODY_MAX=8192;
export const PO_PORTAL_COOKIE_PREFIX='ccr_po_portal_';
export const PO_PORTAL_COOKIE_PATH='/api/pro/po-portal';
export const poPortalCookieName=(linkId:string)=>PO_PORTAL_COOKIE_PREFIX+linkId.toLowerCase().replace(/-/g,'');
export function poPortalCookieLink(name:string){const m=/^ccr_po_portal_([0-9a-f]{32})$/.exec(name);if(!m)return null;const h=m[1]!;return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
export const poPortalTokenSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
/** Query parameter naming the link on the vendor page (not secret). */
export const PO_PORTAL_LINK_PARAM='orden';
/** The token travels in the fragment, never in a request URL. */
export function poPortalUrl(origin:string,locale:'es'|'en',token:string){return `${origin}${prefijoDeIdioma(locale)}/orden-proveedor#acceso=${token}`;}

export const poVendorLinkSchema=z.object({id,orderId:id,status:z.enum(['active','claimed','expired','revoked']),createdAt:stamp,expiresAt:stamp,claimedAt:stamp.nullable(),revokedAt:stamp.nullable(),
 revokeReason:z.enum(['owner','replaced']).nullable(),revision,responseCount:z.number().int().min(0),lastRespondedAt:stamp.nullable()}).strict();
export type PoVendorLink=z.infer<typeof poVendorLinkSchema>;
export const poVendorAnswerSchema=z.object({id,response:z.enum(['confirm','decline','propose_date']),proposedDate:day.nullable(),note:z.string().nullable(),respondedAt:stamp}).strict();
export const poVendorOwnerSchema=z.object({orderId:id,status:z.enum(['draft','issued','partial','received','cancelled']),revision,link:poVendorLinkSchema.nullable(),
 responses:z.array(poVendorAnswerSchema.extend({orderRevision:revision,stale:z.boolean()}).strict()).max(50)}).strict();
export type PoVendorOwner=z.infer<typeof poVendorOwnerSchema>;
export const poVendorOwnerQuerySchema=z.object({workId,id}).strict();
export const poVendorOwnerMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create_link'),actionId:id,id,workId,orderId:id,replacesLinkId:id.nullable(),expiresInDays:z.number().int().min(1).max(30)}).strict(),
 z.object({action:z.literal('revoke_link'),actionId:id,id,workId,orderId:id,revision}).strict(),
]);
export type PoVendorOwnerMutation=z.infer<typeof poVendorOwnerMutationSchema>;
export const poVendorOwnerResultSchema=z.object({link:poVendorLinkSchema,replayed:z.boolean().optional(),token:poPortalTokenSchema.optional()}).strict();

export const poVendorViewSchema=z.object({revision,expiresAt:stamp,today:day,business:z.string().nullable(),vendor:z.string(),
 order:z.object({code:z.string(),title:z.string(),status:z.enum(['draft','issued','partial','received','cancelled']),revision,issueDate:day,expectedDate:day.nullable(),deliveryAddress:z.string().nullable(),paymentTerms:z.string().nullable(),
  subtotalCents:cents,taxCents:cents,totalCents:cents,
  lines:z.array(z.object({id,position:z.number().int(),description:z.string(),quantity:z.number(),unit:z.string(),unitCents:cents,taxRate:z.number(),subtotalCents:cents,taxCents:cents,totalCents:cents}).strict())}).strict(),
 canRespond:z.boolean(),
 responses:z.array(z.object({id,response:z.enum(['confirm','decline','propose_date']),proposedDate:day.nullable(),note:z.string().nullable(),respondedAt:stamp,current:z.boolean()}).strict())}).strict();
export type PoVendorView=z.infer<typeof poVendorViewSchema>;
export const poVendorPublicSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('claim'),token:poPortalTokenSchema,device:poPortalTokenSchema.optional()}).strict(),
 z.object({action:z.literal('respond'),link:id.optional(),actionId:id,revision,response:z.enum(['confirm','decline','propose_date']),proposedDate:day.nullable(),
  note:z.string().trim().max(500).refine(value=>!/[\u0000-\u001f\u007f]/.test(value)).nullable().transform(value=>value?value:null)}).strict()
  .refine(value=>(value.response==='propose_date')===(value.proposedDate!==null)),
]);
export type PoVendorPublicInput=z.input<typeof poVendorPublicSchema>;
