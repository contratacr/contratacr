import {z} from 'zod';
import {PRO_FILE_MAX_BYTES} from './file-limit';

/**
 * Ronda F2-B (row 39): visual proposal of a private estimate (cover, introduction, closing, photos from the
 * company or job files), applied explicitly to a shared version as an immutable snapshot. Strict contracts shared
 * by the API route, the UI and the SQL test. File paths and hashes never reach the browser.
 */
const uuid=z.string().uuid(),nint=z.number().int().nonnegative();
export const proposalTargets=['cover','section','line'] as const;
export const proposalSources=['company','work'] as const;
export const proposalImageSchema=z.object({id:uuid,target:z.enum(proposalTargets),targetKey:z.string().max(80),position:z.number().int().positive(),source:z.enum(proposalSources),fileId:uuid,caption:z.string().max(160),name:z.string().max(160),available:z.boolean()}).strict();
export const proposalDesignSchema=z.object({estimateId:uuid,revision:nint,coverTitle:z.string().max(120),intro:z.string().max(4000),closing:z.string().max(2000),images:z.array(proposalImageSchema).max(60),
 lines:z.array(z.object({id:uuid,description:z.string(),group:z.string().nullable()}).strict()),
 publications:z.array(z.object({publicationId:uuid,version:z.number().int().positive(),status:z.string().min(1).max(40),appliedSeq:z.number().int().positive().nullable(),appliedRevision:z.number().int().positive().nullable(),open:z.boolean()}).strict())}).strict();
export const proposalFilesSchema=z.object({items:z.array(z.object({source:z.enum(proposalSources),fileId:uuid,name:z.string(),place:z.string().nullable()}).strict()).max(60)}).strict();
const base={actionId:uuid,estimateId:uuid,revision:nint};
const text=(max:number)=>z.string().max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export const proposalInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),...base,coverTitle:text(120).refine(v=>!/[\n\r\t]/.test(v)),intro:text(4000),closing:text(2000)}).strict(),
 z.object({action:z.literal('add_image'),...base,imageId:uuid,target:z.enum(proposalTargets),targetKey:z.string().max(80),source:z.enum(proposalSources),fileId:uuid,caption:z.string().max(160).refine(v=>!/[\u0000-\u001f\u007f]/.test(v))}).strict(),
 z.object({action:z.literal('remove_image'),...base,imageId:uuid}).strict(),
 z.object({action:z.literal('move_image'),...base,imageId:uuid,direction:z.union([z.literal(-1),z.literal(1)])}).strict(),
 z.object({action:z.literal('publish'),...base,publicationId:uuid}).strict(),
]);
const designCore=proposalDesignSchema.omit({lines:true,publications:true});
export const proposalResultSchema=z.object({action:z.enum(['save','add_image','remove_image','move_image','publish']),revision:nint,proposal:designCore,publicationId:uuid.optional(),seq:z.number().int().positive().optional(),replayed:z.literal(true).optional()}).strict();
export const proposalPublicationSchema=z.object({publicationId:uuid,side:z.enum(['owner','client']),proposal:z.object({seq:z.number().int().positive(),at:z.string().min(10),coverTitle:z.string().max(120),intro:z.string().max(4000),closing:z.string().max(2000),
 images:z.array(z.object({imageId:uuid,target:z.enum(proposalTargets),targetKey:z.string().max(80),caption:z.string().max(160)}).strict()).max(60)}).strict().nullable()}).strict();
export const proposalFileRefSchema=z.object({bucket:z.enum(['pro-company-files','pro-work-files']),objectPath:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/),sha256:z.string().regex(/^[a-f0-9]{64}$/),sizeBytes:z.number().int().positive().max(PRO_FILE_MAX_BYTES)}).strict();
export type ProposalDesign=z.infer<typeof proposalDesignSchema>;
export type ProposalImage=z.infer<typeof proposalImageSchema>;
export type ProposalInput=z.infer<typeof proposalInputSchema>;
export type ProposalPublication=z.infer<typeof proposalPublicationSchema>;
export type ProposalFiles=z.infer<typeof proposalFilesSchema>;
