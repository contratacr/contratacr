import {z} from 'zod';

/** Project "Planning" (Houzz Planning > Estimates): read-only estimates linked to one job. */
export const projectEstimateScopes=['project','client'] as const;
export type ProjectEstimateScope=typeof projectEstimateScopes[number];
export const projectEstimateStatuses=['draft','sent','accepted','declined','withdrawn'] as const;
export type ProjectEstimateStatus=typeof projectEstimateStatuses[number];

export const projectEstimateQuerySchema=z.object({workId:z.string().trim().min(1).max(160),scope:z.enum(projectEstimateScopes).default('project'),after:z.string().uuid().optional()}).strict();

const count=z.number().int().nonnegative();
export const projectEstimateSchema=z.object({
 id:z.string().uuid(),relation:z.enum(projectEstimateScopes),title:z.string().max(160),clientId:z.string().min(1).max(160),clientName:z.string().max(160),
 status:z.enum(projectEstimateStatuses),publicationStatus:z.enum(['awaiting_claim','shared','changes_requested','accepted','declined','withdrawn','superseded']).nullable(),
 currency:z.enum(['CRC','USD']),totalCents:z.number().int().nonnegative(),revision:z.number().int().positive(),unpublishedChanges:z.boolean(),agreement:z.boolean(),
 sourceKind:z.enum(['work','manual']).nullable(),createdAt:z.string(),updatedAt:z.string(),
}).strict();
export type ProjectEstimate=z.infer<typeof projectEstimateSchema>;
export const projectEstimatesPageSchema=z.object({
 workId:z.string().min(1).max(160),clientId:z.string().min(1).max(160),scope:z.enum(projectEstimateScopes),
 items:z.array(projectEstimateSchema).max(20),nextCursor:z.string().uuid().nullable(),counts:z.object({project:count,client:count}).strict(),
}).strict();
export type ProjectEstimatesPage=z.infer<typeof projectEstimatesPageSchema>;
