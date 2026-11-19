import {z} from 'zod';
import {PRO_DOC_MIMES} from './file-formats';

/**
 * Versions in the company library (row 30; company-file-versions-local.sql). Private to the owner:
 * nothing here is shared with customers. The library lists only the current file of each family.
 */
const id=z.string().uuid(),stamp=z.string().min(1);
export const COMPANY_FILE_VERSIONS_BODY_MAX=16384;
export const companyFileVersionSchema=z.object({version:z.number().int().min(1).max(100),kind:z.enum(['original','upload','restore']),restoredFrom:z.number().int().nullable(),note:z.string().nullable(),
 createdAt:stamp,dayCr:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),current:z.boolean(),
 file:z.object({id,name:z.string(),mimeType:z.enum(PRO_DOC_MIMES),sizeBytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/),createdAt:stamp}).strict()}).strict();
export const companyFileFamilySchema=z.object({rootId:id,revision:z.number().int().min(0),currentVersion:z.number().int().min(1),currentFileId:id,versions:z.array(companyFileVersionSchema).min(1).max(100)}).strict();
export type CompanyFileFamily=z.infer<typeof companyFileFamilySchema>;
export type CompanyFileVersion=z.infer<typeof companyFileVersionSchema>;
export const companyFileVersionIndexSchema=z.array(z.object({fileId:id,rootId:id,currentVersion:z.number().int().min(1),versionCount:z.number().int().min(1)}).strict()).max(20);
export type CompanyFileVersionIndex=z.infer<typeof companyFileVersionIndexSchema>;
const note=z.string().trim().max(500).nullable().transform(value=>value?value:null);
const revision=z.number().int().min(0).max(2147483646);
export const companyFileVersionMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('add_version'),actionId:id,fileId:id,newFileId:id,note,revision}).strict(),
 z.object({action:z.literal('restore'),actionId:id,fileId:id,version:z.number().int().min(1).max(100),note,revision}).strict(),
]);
export type CompanyFileVersionMutation=z.infer<typeof companyFileVersionMutationSchema>;
export const companyFileVersionResultSchema=z.object({action:z.enum(['add_version','restore']),family:companyFileFamilySchema,file:z.unknown()}).strict();
export const companyFileVersionQuerySchema=z.union([z.object({fileId:id}).strict(),z.object({files:z.string().max(800)}).strict()]);
