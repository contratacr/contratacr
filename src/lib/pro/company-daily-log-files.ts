import {z} from 'zod';
import {companyFileSchema} from './company-files';
import {dailyLogFileSchema} from './daily-log-files';
const id=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const companyDailyLogFileMutationSchema=z.object({action:z.literal('copy_from_company'),actionId:id,workId:z.string().min(1).max(160),logId:id,sourceFileId:id,sourceRevision:z.number().int().positive().max(2147483647),sourceSha256:hash,targetFileId:id}).strict().refine(v=>v.sourceFileId!==v.targetFileId);
export const companyDailyLogFileResultSchema=z.object({action:z.literal('copy_from_company'),source:companyFileSchema,file:dailyLogFileSchema,revision:z.number().int().positive().max(2147483647)}).strict().refine(v=>v.source.ready&&!v.source.archived&&v.file.ready&&v.file.createdBy===v.file.ownerId&&v.file.createdGrantId===null&&v.file.sourceInviteId===null&&v.file.id!==v.source.id&&v.file.sha256===v.source.sha256&&v.file.name===v.source.name&&v.file.sizeBytes===v.source.sizeBytes&&v.file.mimeType===v.source.mimeType);
export const companyDailyLogFileReceiptSchema=z.object({receipt:z.object({inputHash:hash,source:companyFileSchema,result:companyDailyLogFileResultSchema}).strict().refine(v=>JSON.stringify(v.source)===JSON.stringify(v.result.source)).nullable()}).strict();
export type CompanyDailyLogFileMutation=z.infer<typeof companyDailyLogFileMutationSchema>;
export type CompanyDailyLogFileResult=z.infer<typeof companyDailyLogFileResultSchema>;
export function canonicalCompanyDailyLogFileInput(input:CompanyDailyLogFileMutation):string{
 const parsed=companyDailyLogFileMutationSchema.parse(input);return JSON.stringify(Object.fromEntries(Object.entries(parsed).sort(([a],[b])=>a<b?-1:a>b?1:0)));
}
