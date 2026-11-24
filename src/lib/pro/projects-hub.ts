import {z} from 'zod';
import {projectColors,projectHubPageSchema,projectHubRowSchema,projectTagSchema,projectTypeSchema} from '@/lib/pro/project-details';
import {projectStatuses} from '@/lib/pro/projects';

/** Area A, Projects list v3: multi-status filter, sortable columns, pinned rows, managers and custom Kanban statuses. */
export const hubSortKeys=['default','name','client','status','created','viewed','location'] as const;
export type HubSortKey=typeof hubSortKeys[number];
const id=z.string().uuid();
export const hubStatusSchema=z.object({id,name:z.string().min(1).max(40),color:z.enum(projectColors)}).strict();
export type HubStatus=z.infer<typeof hubStatusSchema>;
export const hubPersonSchema=z.object({id,name:z.string().max(160)}).strict();
export const hubRowSchema=projectHubRowSchema.extend({
 created:z.string().nullable(),viewed:z.string().nullable(),pinned:z.boolean(),location:z.string().nullable(),customStatusId:id.nullable(),managers:z.array(hubPersonSchema).max(10),
}).strict();
export type HubRow=z.infer<typeof hubRowSchema>;
export const hubPageSchema=projectHubPageSchema.extend({
 items:z.array(hubRowSchema).max(20),
 filters:z.object({types:z.array(projectTypeSchema).max(50),tags:z.array(projectTagSchema).max(200),managers:z.array(hubPersonSchema).max(200),statuses:z.array(hubStatusSchema).max(20)}).strict(),
}).strict();
export type HubPage=z.infer<typeof hubPageSchema>;
/** statuses is a comma list of base statuses (empty = every status); after is the row offset. */
export const hubQuerySchema=z.object({
 statuses:z.string().max(80).default('').transform(value=>value?value.split(','):[]).pipe(z.array(z.enum(projectStatuses)).max(4)),
 q:z.string().max(160).default(''),after:z.coerce.number().int().positive().max(100000).optional(),
 type:id.optional(),tag:id.optional(),manager:id.optional(),
 sort:z.enum(hubSortKeys).default('default'),dir:z.enum(['asc','desc']).default('desc'),
}).strict();
const workId=z.string().trim().min(1).max(160);
export const hubMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('viewed'),workId}).strict(),
 z.object({action:z.literal('pin'),workId,pinned:z.boolean()}).strict(),
 z.object({action:z.literal('managers'),workId,memberIds:z.array(id).max(10)}).strict(),
 z.object({action:z.literal('status_set'),workId,statusId:id.nullable()}).strict(),
 z.object({action:z.literal('status_create'),id,name:z.string().trim().min(1).max(40),color:z.enum(projectColors)}).strict(),
 z.object({action:z.literal('status_rename'),id,name:z.string().trim().min(1).max(40),color:z.enum(projectColors)}).strict(),
 z.object({action:z.literal('status_delete'),id}).strict(),
 z.object({action:z.literal('status_reorder'),ids:z.array(id).max(20)}).strict(),
]);
export const hubMutationResultSchema=z.object({ok:z.literal(true),statuses:z.array(hubStatusSchema).max(20)}).strict();
