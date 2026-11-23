import {z} from 'zod';
/**
 * Rows 35 and 39: the formal partial response of a shared quote version, its direct conversion into the agreement of a job and the
 * acceptance the professional records when the customer accepted outside the platform. Shared by the routes, the UI and the specs.
 */
const uuid=z.string().uuid(),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/),stamp=z.string().min(10),cents=z.number().int().nonnegative();
export const recordedAcceptanceMethods=['signed_paper','email','whatsapp','phone','in_person'] as const;
export const lineResponseSchema=z.object({publicationId:uuid,respondedAt:stamp,respondedByName:z.string().max(200),contentHash:z.string().regex(/^[a-f0-9]{64}$/),currency:z.enum(['CRC','USD']),
 approvedLineIds:z.array(uuid).min(1),declinedLineIds:z.array(uuid).min(1),approvedCount:z.number().int().positive(),declinedCount:z.number().int().positive(),approvedCents:cents,declinedCents:cents,note:z.string().max(300)}).strict();
export type LineResponse=z.infer<typeof lineResponseSchema>;
export const lineResponseReadSchema=z.object({response:lineResponseSchema.nullable()}).strict();
export const lineResponseInputSchema=z.object({actionId:uuid,publicationId:uuid,note:z.string().trim().max(300)}).strict();
export const recordedAcceptanceSchema=z.object({publicationId:uuid,kind:z.enum(['external','partial_response']),workId:z.string().min(1).max(80),method:z.enum([...recordedAcceptanceMethods,'partial_response']),acceptedOn:day,
 acceptedByName:z.string().min(2).max(120),evidenceNote:z.string().max(500),sourcePublicationId:uuid.nullable(),recordedAt:stamp,estimateId:uuid,version:z.number().int().positive(),title:z.string().nullable(),
 currency:z.enum(['CRC','USD']),totalCents:cents}).strict();
export type RecordedAcceptance=z.infer<typeof recordedAcceptanceSchema>;
const workOption=z.object({id:z.string().min(1).max(80),label:z.string().max(400)}).strict();
export const acceptanceEstimateReadSchema=z.object({estimateId:uuid,revision:z.number().int().positive(),currency:z.enum(['CRC','USD']),totalCents:cents,archived:z.boolean(),recorded:recordedAcceptanceSchema.nullable(),works:z.array(workOption).max(200),accepted:z.boolean()}).strict();
export const acceptancePublicationReadSchema=z.object({publicationId:uuid,response:lineResponseSchema.nullable(),conversion:recordedAcceptanceSchema.nullable(),targetWorkId:z.string().nullable(),works:z.array(workOption).max(200)}).strict();
export const acceptanceInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('external'),actionId:uuid,estimateId:uuid,estimateRevision:z.number().int().positive().max(2147483647),workId:z.string().min(1).max(80),method:z.enum(recordedAcceptanceMethods),acceptedOn:day,
  acceptedByName:z.string().trim().min(2).max(120),evidenceNote:z.string().trim().min(10).max(500)}).strict(),
 z.object({action:z.literal('partial_response'),actionId:uuid,publicationId:uuid,workId:z.string().min(1).max(80).nullable()}).strict(),
]);
export type AcceptanceInput=z.infer<typeof acceptanceInputSchema>;
export const acceptanceResultSchema=z.object({action:z.enum(['external','partial_response']),publicationId:uuid,estimateId:uuid,workId:z.string(),version:z.number().int().positive(),currency:z.enum(['CRC','USD']),totalCents:cents,
 acceptedOn:day,acceptedByName:z.string(),method:z.string(),lineCount:z.number().int().nonnegative()}).strict();
export type AcceptanceResult=z.infer<typeof acceptanceResultSchema>;
/** Stable reason codes from the database messages (the UI translates them; the raw message never reaches the page). */
export function acceptanceReason(message:string):string|null{
 const m=message||'';
 if(/colones/i.test(m))return 'currency';if(/Choose the job/i.test(m))return 'job';if(/Convert the opportunity/i.test(m))return 'convert_first';if(/another job|converted into another/i.test(m))return 'other_job';
 if(/Work continuation unavailable/i.test(m))return 'job_rules';if(/Already converted/i.test(m))return 'already_converted';if(/formal partial response/i.test(m))return 'no_response';
 if(/Accepted version is immutable/i.test(m))return 'already_accepted';if(/Saved draft changed/i.test(m))return 'stale';if(/Restore the customer/i.test(m))return 'client_archived';if(/no amount to agree/i.test(m))return 'empty';
 return null;
}
