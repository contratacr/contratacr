import {z} from 'zod';
import {PRO_FILE_BODY_MAX,PRO_FILE_MAX_BYTES} from './file-limit';
import {prefijoDeIdioma} from "@/lib/prefijo-de-idioma";

/**
 * Vendor portal for bid packages (row 53, docs/pro/bids-local.md). The owner copies a
 * single-use invitation link for one invited vendor; nothing is e-mailed. Only keyed hashes
 * (HMAC-SHA256, PRO_BID_PORTAL_SECRET) of the random link and vendor session tokens are stored
 * (bid-vendor-portal-local.sql, bid-portal-server.ts).
 */
const id=z.string().uuid();
const workId=z.string().trim().min(1).max(160);
const revision=z.number().int().min(1).max(2147483646);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const stamp=z.string().min(1);
const cents=z.number().int().min(0).max(10000000000);
export const BID_PORTAL_BODY_MAX=16384;
/** One session cookie per link, so a vendor invited to several bids keeps every session. */
export const BID_PORTAL_COOKIE_PREFIX='ccr_bid_portal_';
export const BID_PORTAL_COOKIE_PATH='/api/pro/bid-portal';
export const bidPortalCookieName=(linkId:string)=>BID_PORTAL_COOKIE_PREFIX+linkId.toLowerCase().replace(/-/g,'');
/** Link id from a cookie name (32 hex), or null. */
export function bidPortalCookieLink(name:string){const m=/^ccr_bid_portal_([0-9a-f]{32})$/.exec(name);if(!m)return null;const h=m[1];return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
/** base64url of 32 random bytes. */
export const bidPortalTokenSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
/** Query parameter of the vendor page and of GET /api/pro/bid-portal naming the link (not secret). */
export const BID_PORTAL_LINK_PARAM='invitacion';

export const bidPortalLinkStatusSchema=z.enum(['active','claimed','expired','revoked']);
export const bidPortalLinkSchema=z.object({id,packageId:id,supplierId:id,status:bidPortalLinkStatusSchema,createdAt:stamp,expiresAt:stamp,claimedAt:stamp.nullable(),
 revokedAt:stamp.nullable(),revokeReason:z.enum(['owner','replaced']).nullable(),revision,submissionCount:z.number().int().min(0),lastSubmittedAt:stamp.nullable()}).strict();
export type BidPortalLink=z.infer<typeof bidPortalLinkSchema>;
export const bidPortalOwnerSchema=z.object({packageId:id,status:z.enum(['draft','open','closed','awarded','cancelled']),dueDate:day.nullable(),today:day,
 vendors:z.array(z.object({supplierId:id,link:bidPortalLinkSchema.nullable(),portalSubmissions:z.number().int().min(0),lastPortalSubmissionAt:stamp.nullable()}).strict())}).strict();
export type BidPortalOwner=z.infer<typeof bidPortalOwnerSchema>;
export const bidPortalOwnerQuerySchema=z.object({workId,id}).strict();
export const bidPortalOwnerMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create_link'),actionId:id,id,workId,packageId:id,supplierId:id,replacesLinkId:id.nullable(),expiresInDays:z.number().int().min(1).max(30)}).strict(),
 z.object({action:z.literal('revoke_link'),actionId:id,id,workId,packageId:id,supplierId:id,revision}).strict(),
]);
export type BidPortalOwnerMutation=z.infer<typeof bidPortalOwnerMutationSchema>;
/** A replayed create never carries the token again: the owner replaces the link to get a new one. */
export const bidPortalOwnerResultSchema=z.object({link:bidPortalLinkSchema,replayed:z.boolean().optional(),token:bidPortalTokenSchema.optional()}).strict();

export const bidPortalViewSchema=z.object({revision,expiresAt:stamp,today:day,business:z.string().nullable(),vendor:z.string(),
 package:z.object({code:z.string(),title:z.string(),scope:z.string().nullable(),dueDate:day.nullable(),status:z.enum(['draft','open','closed','awarded','cancelled']),
  lines:z.array(z.object({id,position:z.number().int(),description:z.string(),quantity:z.number(),unit:z.string()}).strict())}).strict(),
 offer:z.object({receivedOn:day,leadDays:z.number().int().nullable(),validUntil:day.nullable(),notes:z.string().nullable(),recordedAt:stamp,
  prices:z.array(z.object({lineId:id,unitCents:cents,totalCents:z.number().int()}).strict())}).strict().nullable(),
 submissions:z.number().int().min(0),
 // Round 4B: the vendor's own attachments and the award notice of its invitation.
 attachments:z.lazy(()=>bidPortalVendorExtrasSchema)}).strict();
export type BidPortalView=z.infer<typeof bidPortalViewSchema>;
export const bidPortalPublicSchema=z.discriminatedUnion('action',[
 // device: random id kept by the vendor's browser; lets the same browser re-claim within 2 minutes.
 z.object({action:z.literal('claim'),token:bidPortalTokenSchema,device:bidPortalTokenSchema.optional()}).strict(),
 // link: which invitation (cookie) the offer is for; optional when the browser holds a single one.
 z.object({action:z.literal('submit'),link:id.optional(),actionId:id,revision,leadDays:z.number().int().min(0).max(3650).nullable(),validUntil:day.nullable(),
  notes:z.string().trim().max(2000).nullable().transform(value=>value?value:null),prices:z.array(z.object({lineId:id,unitCents:cents}).strict()).min(1).max(100)}).strict(),
]);
export type BidPortalPublicInput=z.input<typeof bidPortalPublicSchema>;
/** Path of the vendor page; the token travels in the fragment, never in a request URL. */
export function bidPortalUrl(origin:string,locale:'es'|'en',token:string){return `${origin}${prefijoDeIdioma(locale)}/licitacion-proveedor#acceso=${token}`;}

/**
 * Round 4B: attachments the vendor sends with its offer (bid-portal-files-local.sql). Same file
 * contract as job files: JPG (re-encoded) or PDF, at most 20 MB (shared Pro file limit). Readable only by the
 * owner of the bid and by that vendor; every download is reauthorized (no signed or public URL).
 */
export const BID_PORTAL_FILE_MAX_BYTES=PRO_FILE_MAX_BYTES;
export const BID_PORTAL_FILE_LIMIT=10;
export const BID_PORTAL_FILE_BODY_MAX=PRO_FILE_BODY_MAX;
export const bidPortalFileSchema=z.object({id,name:z.string().min(1).max(160),mimeType:z.enum(['image/jpeg','application/pdf']),sizeBytes:z.number().int().positive().max(BID_PORTAL_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/),createdAt:stamp}).strict();
export type BidPortalFile=z.infer<typeof bidPortalFileSchema>;
export const bidPortalOutcomeSchema=z.object({status:z.enum(['won','partial','not_selected','cancelled']),decidedAt:stamp.nullable(),lineCount:z.number().int().min(0),totalLineCount:z.number().int().min(0),wonCents:z.number().int().nullable(),
 lines:z.array(z.object({lineId:id,position:z.number().int(),description:z.string(),totalCents:z.number().int()}).strict())}).strict();
export type BidPortalOutcome=z.infer<typeof bidPortalOutcomeSchema>;
export const bidPortalVendorExtrasSchema=z.object({canAttach:z.boolean(),files:z.array(bidPortalFileSchema).max(BID_PORTAL_FILE_LIMIT),outcome:bidPortalOutcomeSchema.nullable()}).strict();
export const bidPortalFileMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('upload'),link:id.optional(),fileId:id,name:z.string().trim().min(1).max(160),data:z.string().min(4).max(4*Math.ceil(BID_PORTAL_FILE_MAX_BYTES/3))}).strict(),
 z.object({action:z.literal('remove'),link:id.optional(),fileId:id}).strict(),
]);
export type BidPortalFileMutation=z.infer<typeof bidPortalFileMutationSchema>;
export const bidPortalOwnerFilesSchema=z.object({packageId:id,files:z.array(bidPortalFileSchema.extend({supplierId:id})).max(1000)}).strict();
export type BidPortalOwnerFiles=z.infer<typeof bidPortalOwnerFilesSchema>;
export const bidPortalOwnerFilesQuerySchema=z.object({view:z.literal('files'),workId,id}).strict();
export const bidPortalFileDownloadSchema=z.object({objectPath:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|pdf)$/),name:z.string().min(1).max(160),mimeType:z.enum(['image/jpeg','application/pdf']),sizeBytes:z.number().int().positive().max(BID_PORTAL_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
