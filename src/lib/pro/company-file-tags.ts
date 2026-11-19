import {z} from 'zod';
import {companyFileSchema} from './company-files';
/** Ronda F2-D (row 31): library tags. Preset keys are stored in English and shown localized. */
export const COMPANY_FILE_TAG_PRESETS=['template','manual','permit'] as const;
export const COMPANY_FILE_TAGS_MAX=6;
const tag=z.string().trim().toLowerCase().min(1).max(30).refine(value=>!/[\u0000-\u001f\u007f/\\,]/u.test(value),'Invalid tag');
export const companyFileTagsQuerySchema=z.object({tag:tag.optional()}).strict();
export const companyFileTagsInputSchema=z.object({action:z.literal('set_tags'),actionId:z.string().uuid(),fileId:z.string().uuid(),tags:z.array(tag).max(COMPANY_FILE_TAGS_MAX)}).strict();
export const companyFileTagsReadSchema=z.object({tags:z.array(z.object({tag:z.string(),count:z.number().int().positive()}).strict()),fileTags:z.record(z.string().uuid(),z.array(z.string())),files:z.array(companyFileSchema),tag:z.string().nullable()}).strict();
export const companyFileTagsResultSchema=z.object({fileId:z.string().uuid(),tags:z.array(z.string()),replayed:z.boolean().optional()}).strict();
export type CompanyFileTagsRead=z.infer<typeof companyFileTagsReadSchema>;
export function companyFileTagLabel(value:string,en:boolean){
 switch(value){case 'template':return en?'Template':'Plantilla';case 'manual':return 'Manual';case 'permit':return en?'Permit':'Permiso';default:return value;}
}
