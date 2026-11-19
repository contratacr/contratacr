import {z} from 'zod';

/**
 * Round 8 (2026-11-15, local): shared schemas of the job page (right column), the editable overview
 * layout, the person timer, message attachments, the job file organizer and subcontractor access.
 * The SQL functions are the authority; these schemas only shape requests and responses.
 */
export const overviewWidgets=['client','next','schedule','finance','activity','open'] as const;
export type OverviewWidget=typeof overviewWidgets[number];
export const overviewLayoutSchema=z.object({order:z.array(z.enum(overviewWidgets)).length(overviewWidgets.length),hidden:z.array(z.enum(overviewWidgets)).max(overviewWidgets.length-1)}).strict();
export type OverviewLayout=z.infer<typeof overviewLayoutSchema>;
export const overviewLayoutPageSchema=z.object({layout:overviewLayoutSchema,revision:z.number().int().min(0),custom:z.boolean(),widgets:z.array(z.string()),replayed:z.boolean().optional()}).passthrough();
export const overviewLayoutInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),actionId:z.string().uuid(),revision:z.number().int().min(0),layout:overviewLayoutSchema}).strict(),
 z.object({action:z.literal('reset'),actionId:z.string().uuid(),revision:z.number().int().min(0)}).strict(),
]);
export function defaultOverviewLayout():OverviewLayout{return{order:[...overviewWidgets],hidden:[]};}

export const workSidebarSchema=z.object({
 workId:z.string(),
 status:z.object({stage:z.string().nullable(),cancelled:z.boolean(),start:z.string().nullable(),end:z.string().nullable(),phase:z.string().nullable()}),
 location:z.object({address:z.string().nullable(),visit:z.string().nullable()}),
 customer:z.object({name:z.string().nullable(),linked:z.boolean()}),
 collaborators:z.array(z.object({kind:z.enum(['job','subcontractor']),name:z.string().nullable(),role:z.string()})),
 meetings:z.array(z.object({kind:z.enum(['appointment','milestone']),id:z.string(),title:z.string().nullable(),at:z.string(),status:z.string()})),
 tags:z.array(z.string()),code:z.string().nullable(),color:z.string().nullable(),
}).passthrough();
export type WorkSidebar=z.infer<typeof workSidebarSchema>;

export const timerSchema=z.object({id:z.string().uuid(),workId:z.string(),service:z.string().nullable(),activityId:z.string().uuid().nullable(),activityName:z.string().nullable(),billable:z.boolean(),note:z.string(),
 status:z.enum(['running','stopped','saved','discarded']),startedAt:z.string(),stoppedAt:z.string().nullable(),minutes:z.number().int(),personName:z.string(),revision:z.number().int(),timeEntryId:z.string().uuid().nullable()}).passthrough();
export type WorkTimer=z.infer<typeof timerSchema>;
export const timerPageSchema=z.object({timer:timerSchema.nullable(),serverNow:z.string(),activities:z.array(z.object({id:z.string().uuid(),name:z.string(),billable:z.boolean()}))}).passthrough();
export const timerInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('start'),actionId:z.string().uuid(),workId:z.string().min(1).max(160),activityId:z.string().uuid().nullable(),billable:z.boolean(),note:z.string().max(300)}).strict(),
 z.object({action:z.enum(['stop','discard']),actionId:z.string().uuid(),timerId:z.string().uuid(),revision:z.number().int().positive()}).strict(),
 z.object({action:z.literal('save'),actionId:z.string().uuid(),timerId:z.string().uuid(),revision:z.number().int().positive(),activityId:z.string().uuid().nullable(),billable:z.boolean(),note:z.string().max(300),
  minutes:z.number().int().min(1).max(1440),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict(),
]);
/** Custom event: any timer control tells the running-timer indicator to reload. */
export const PRO_TIMER_CHANGED='ccr:pro-timer-changed';

export const messageFileSchema=z.object({id:z.string().uuid(),messageId:z.string().uuid(),name:z.string(),mimeType:z.enum(['image/jpeg','application/pdf']),sizeBytes:z.number().int(),createdAt:z.string()}).passthrough();
export type MessageFile=z.infer<typeof messageFileSchema>;

export const organizerFileSchema=z.object({id:z.string().uuid(),name:z.string(),originalName:z.string(),mimeType:z.string(),sizeBytes:z.number(),folderId:z.string().uuid().nullable(),favorite:z.boolean(),
 trashedAt:z.string().nullable(),restoreUntil:z.string().nullable(),metaRevision:z.number().int(),createdAt:z.string(),publishedAt:z.string().nullable().optional()}).passthrough();
export const organizerFolderSchema=z.object({id:z.string().uuid(),parentId:z.string().uuid().nullable(),name:z.string(),revision:z.number().int(),trashedAt:z.string().nullable(),restoreUntil:z.string().nullable(),items:z.number().int(),clientVisible:z.boolean().optional()}).passthrough();
export const organizerPageSchema=z.object({workId:z.string(),view:z.enum(['folder','favorites','trash','search']),folderId:z.string().uuid().nullable(),
 breadcrumb:z.array(z.object({id:z.string().uuid(),name:z.string()})),folders:z.array(organizerFolderSchema),files:z.array(organizerFileSchema),
 allFolders:z.array(z.object({id:z.string().uuid(),parentId:z.string().uuid().nullable(),name:z.string()})),trashCount:z.number().int(),quota:z.object({usedBytes:z.number().nonnegative(),limitBytes:z.number().positive()}).optional()}).passthrough();
export type OrganizerPage=z.infer<typeof organizerPageSchema>;
const name=z.string().trim().min(1).max(160);
export const organizerInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create_folder'),actionId:z.string().uuid(),workId:z.string().min(1).max(160),folderId:z.string().uuid(),parentId:z.string().uuid().nullable(),name:z.string().trim().min(1).max(80)}).strict(),
 z.object({action:z.enum(['rename_folder','rename_file']),actionId:z.string().uuid(),workId:z.string().min(1).max(160),subjectId:z.string().uuid(),revision:z.number().int().min(0),name}).strict(),
 z.object({action:z.enum(['move_folder','move_file']),actionId:z.string().uuid(),workId:z.string().min(1).max(160),subjectId:z.string().uuid(),revision:z.number().int().min(0),targetId:z.string().uuid().nullable()}).strict(),
 z.object({action:z.enum(['trash_folder','restore_folder','trash_file','restore_file','purge_folder','purge_file']),actionId:z.string().uuid(),workId:z.string().min(1).max(160),subjectId:z.string().uuid(),revision:z.number().int().min(0)}).strict(),
 z.object({action:z.enum(['favorite_file','share_folder']),actionId:z.string().uuid(),workId:z.string().min(1).max(160),subjectId:z.string().uuid(),revision:z.number().int().min(0),on:z.boolean()}).strict(),
]);

export const subOwnerInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('invite'),actionId:z.string().uuid(),workId:z.string().min(1).max(160),supplierId:z.string().uuid(),email:z.string().trim().toLowerCase().email().max(254)}).strict(),
 z.object({action:z.enum(['add_job','remove_job']),actionId:z.string().uuid(),workId:z.string().min(1).max(160),accessId:z.string().uuid()}).strict(),
 z.object({action:z.enum(['assign_task','share_file']),actionId:z.string().uuid(),workId:z.string().min(1).max(160),accessId:z.string().uuid(),subjectId:z.string().uuid(),on:z.boolean()}).strict(),
 z.object({action:z.literal('revoke'),actionId:z.string().uuid(),accessId:z.string().uuid(),revision:z.number().int().positive()}).strict(),
 z.object({action:z.literal('comment'),actionId:z.string().uuid(),workId:z.string().min(1).max(160),accessId:z.string().uuid(),subjectId:z.string().uuid(),body:z.string().trim().min(1).max(1000)}).strict(),
]);
export const subPortalInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('accept'),actionId:z.string().uuid(),code:z.string().trim().min(8).max(64)}).strict(),
 z.object({action:z.literal('comment'),actionId:z.string().uuid(),ownerId:z.string().uuid(),accessId:z.string().uuid(),taskId:z.string().uuid(),body:z.string().trim().min(1).max(1000)}).strict(),
 z.object({action:z.enum(['complete','reopen']),actionId:z.string().uuid(),ownerId:z.string().uuid(),accessId:z.string().uuid(),taskId:z.string().uuid(),revision:z.number().int().positive()}).strict(),
]);
/** Normalized invitation code: uppercase letters and digits only (spaces and dashes ignored). */
export const subCode=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,'');
