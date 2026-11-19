import {z} from 'zod';
import {dailyLogMutationSchema,dailyLogResultSchema} from './daily-logs';
import {dailyLogDiscussionContextSchema} from './daily-log-discussion';
import {canonicalWorkFileName,workFileNameSchema,WORK_FILE_MAX_BYTES} from './work-files';
import {PRO_FILE_MAX_BYTES} from './file-limit';
const id=z.string().uuid(),workId=z.string().min(1).max(160),revision=z.number().int().nonnegative().max(2147483647),stamp=z.string().datetime({offset:true}),hash=z.string().regex(/^[a-f0-9]{64}$/);
const common={id,name:workFileNameSchema,mimeType:z.enum(['image/jpeg','application/pdf']),sizeBytes:z.number().int().positive().max(WORK_FILE_MAX_BYTES),sha256:hash,createdAt:stamp};
function validFile(v:{name:string;mimeType:'image/jpeg'|'application/pdf';sizeBytes:number}){return canonicalWorkFileName(v.name,v.mimeType)===v.name&&(v.mimeType!=='image/jpeg'||v.sizeBytes<=PRO_FILE_MAX_BYTES);}
export const dailyLogFileSchema=z.object({...common,ownerId:id,workId,logId:id,ready:z.boolean(),createdBy:id,createdByName:z.string().max(160),createdGrantId:id.nullable(),sourceInviteId:id.nullable()}).strict().refine(v=>validFile(v)&&(v.createdGrantId===null)===(v.sourceInviteId===null));
export const dailyLogFileSnapshotSchema=z.object(common).strict().refine(validFile);
export const dailyLogFileContextSchema=z.object({ownerId:id,workId,logId:id,grantId:id.nullable(),generation:id.nullable(),exists:z.boolean(),canUpload:z.boolean(),revision}).strict().refine(v=>(v.grantId===null)===(v.generation===null));
export const dailyLogFilesPageSchema=z.object({context:dailyLogFileContextSchema,items:z.array(dailyLogFileSchema).max(20),nextCursor:id.nullable()}).strict().refine(v=>new Set(v.items.map(f=>f.id)).size===v.items.length&&v.items.every(f=>f.ownerId===v.context.ownerId&&f.workId===v.context.workId&&f.logId===v.context.logId)&&(v.nextCursor===null||v.items.at(-1)?.id===v.nextCursor));
export const dailyLogPublishedFilesPageSchema=z.object({context:dailyLogDiscussionContextSchema,items:z.array(dailyLogFileSnapshotSchema).max(20),nextCursor:id.nullable()}).strict();
const base={actionId:id,workId,logId:id,grantId:id.nullable(),generation:id.nullable()};
export const dailyLogFileUploadSchema=z.object({...base,action:z.literal('upload'),fileId:id,name:workFileNameSchema,data:z.string().min(4).max(4*Math.ceil(WORK_FILE_MAX_BYTES/3))}).strict();
export const dailyLogFileCopySchema=z.object({...base,action:z.literal('copy'),fileId:id,sourceLogId:id,sourceFileId:id,sourceSha256:hash}).strict();
const refs=z.array(z.object({id,sha256:hash}).strict()).max(20).refine(a=>new Set(a.map(f=>f.id)).size===a.length);
export const dailyLogFileSelectionSchema=z.object({revision,client:refs,team:refs}).strict();
const legacyPublish=dailyLogMutationSchema.options[4];
export const dailyLogFilesPublishSchema=legacyPublish.extend({files:dailyLogFileSelectionSchema}).strict();
export const dailyLogFileMutationSchema=z.discriminatedUnion('action',[dailyLogFileUploadSchema,dailyLogFileCopySchema,dailyLogFilesPublishSchema]).superRefine((v,c)=>{if(v.action==='publish'){if(v.grantId!==null||v.client===null&&v.team.length===0||v.client===null&&v.files.client.length>0||v.team.length===0&&v.files.team.length>0)c.addIssue({code:'custom',message:'Choose the matching publication audiences.'});}else if((v.grantId===null)!==(v.generation===null)||v.action==='copy'&&v.fileId===v.sourceFileId)c.addIssue({code:'custom',message:'Invalid upload scope.'});});
const legacyResult=dailyLogResultSchema.options[1];
export const dailyLogFileResultSchema=z.discriminatedUnion('action',[
 z.object({action:z.enum(['upload','copy']),file:dailyLogFileSchema,revision}).strict().refine(v=>v.file.ready),
 z.object({action:z.literal('publish'),publication:legacyResult,files:z.object({client:z.array(dailyLogFileSnapshotSchema).max(20),team:z.array(dailyLogFileSnapshotSchema).max(20)}).strict()}).strict(),
]);
export const dailyLogFileReceiptSchema=z.object({receipt:z.object({inputHash:hash,result:dailyLogFileResultSchema}).strict().nullable()}).strict();
export type DailyLogFile=z.infer<typeof dailyLogFileSchema>;
export type DailyLogFileMutation=z.infer<typeof dailyLogFileMutationSchema>;
export type DailyLogFileResult=z.infer<typeof dailyLogFileResultSchema>;
export type DailyLogFileSnapshot=z.infer<typeof dailyLogFileSnapshotSchema>;
export type DailyLogFileContext=z.infer<typeof dailyLogFileContextSchema>;
export function canonicalDailyLogFileInput(input:DailyLogFileMutation){const sort=(v:unknown):unknown=>Array.isArray(v)?v.map(sort):v!==null&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,sort(x)])):v;return JSON.stringify(sort(dailyLogFileMutationSchema.parse(input)));}
