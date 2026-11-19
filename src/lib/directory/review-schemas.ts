import {z} from 'zod';
import {validateReviewText} from '../moderation/reviews';

// LOCAL PRO ONLY (multivertical F5). zod mirrors of directory-reviews-local.sql; the database checks again.
// Same rules as professional reviews: half stars, 300-character comment run through validateReviewText (insults,
// threats, links, @handles), one review per person and place, moderation published/hidden by staff only.
// Not imported by any route yet: wiring is listed in the F3/F5 wiring notes.

export const REVIEW_MODERATION_STATUSES=['published','hidden'] as const;
export type ReviewModerationStatus=typeof REVIEW_MODERATION_STATUSES[number];
export const CONTACT_CHANNELS=['whatsapp','call','message'] as const;
export const REVIEW_LIMITS={commentMax:300,replyMax:1000,nameMin:2,nameMax:80,guestContactDays:90,reviewsPerDay:10,pageSize:20} as const;

const uuid=z.string().uuid();
const slug=z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/);
const hex64=z.string().regex(/^[a-f0-9]{64}$/);
export const reviewRatingSchema=z.number().min(0.5).max(5).refine(v=>Number.isInteger(v*2),'Use medias estrellas (0,5).');
/** Applies the shared review text rules and returns the normalized text. */
export const reviewCommentSchema=(locale:'es'|'en'='es')=>z.string().transform((v,ctx)=>{
 const r=validateReviewText(v,locale);
 if(!r.ok||!('comment' in r)||typeof r.comment!=='string'){ctx.addIssue({code:'custom',message:r.error??'Invalid'});return z.NEVER;}
 return r.comment;
});
const authorName=z.string().trim().transform(v=>v.replace(/\s+/g,' ')).pipe(z.string().min(REVIEW_LIMITS.nameMin,'Escriba su nombre.').max(REVIEW_LIMITS.nameMax));

/** Browser → route. authorName: for signed-in authors the route uses the profile name (snapshot), not this field. */
export const reviewSubmitSchema=(locale:'es'|'en'='es')=>z.object({
 actionId:uuid,reviewId:uuid,slug,revision:z.number().int().min(0),rating:reviewRatingSchema,comment:reviewCommentSchema(locale),
 authorName:authorName.optional(),
}).strict();
/** Route → dir_review_submit for a guest: contactId from the httpOnly cookie, visitorHash computed by the server. */
export const guestReviewDbInputSchema=z.object({
 actionId:uuid,reviewId:uuid,slug,revision:z.number().int().min(0),rating:reviewRatingSchema,comment:z.string().min(1).max(300),
 authorName,contactId:uuid,visitorHash:hex64,
}).strict();
export const contactRecordSchema=z.object({contactId:uuid,channel:z.enum(CONTACT_CHANNELS),visitorHash:hex64}).strict();
export const ownerReplySchema=z.object({actionId:uuid,reviewId:uuid,reply:z.string().trim().min(1,'Escriba la respuesta.').max(REVIEW_LIMITS.replyMax)
 .refine(v=>!/(https?:\/\/|www\.)/i.test(v),'La respuesta no puede incluir enlaces.')}).strict();
export const reviewModerationSchema=z.object({actionId:uuid,reviewId:uuid,target:z.enum(['review','reply']),status:z.enum(REVIEW_MODERATION_STATUSES),
 reason:z.string().trim().max(500).optional()}).strict().refine(v=>v.status==='published'||(v.reason?.length??0)>=3,{path:['reason'],message:'Indique el motivo.'});
export const reviewCursorSchema=z.object({at:z.string().datetime({offset:true}),id:uuid}).strict();

/** dir_place_reviews_public. */
export type PublicPlaceReview={id:string;name:string;rating:number;comment:string;guest:boolean;createdAt:string;edited:boolean;ownerReply:{text:string;at:string;edited?:boolean;editedAt?:string|null}|null};
/** dir_review_reply_targets (managers only): what each published review allows the business to do. */
export type ReplyTarget={reviewId:string;replyRevision:number;reply:string|null;replyStatus:'published'|'hidden'|null;own:boolean};
export type PublicPlaceReviews={summary:{average:number|null;count:number};items:PublicPlaceReview[];nextCursor:{at:string;id:string}|null};
