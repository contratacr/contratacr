import {z} from 'zod';

/**
 * Leads area: tasks, files, plans (takeoff uploads) and estimate uploads of a lead (manual opportunity or ContrataCR
 * request). Zod-only module: safe to import from client components. Private to the professional; nothing is sent out.
 */
const id=z.string().uuid(),kind=z.enum(['manual','request']);
const noControl=(v:string)=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
export const leadFilePurposes=['file','plan','estimate'] as const;
export type LeadFilePurpose=(typeof leadFilePurposes)[number];
export const leadTaskSchema=z.object({id,title:z.string().min(1).max(160),dueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),done:z.boolean(),revision:z.number().int().min(1),createdAt:z.string().min(10)}).strict();
export type LeadTask=z.infer<typeof leadTaskSchema>;
export const leadTasksSchema=z.object({kind,leadId:id,items:z.array(leadTaskSchema).max(200)}).strict();
export type LeadTasks=z.infer<typeof leadTasksSchema>;
const title=z.string().trim().min(1).max(160).refine(noControl),due=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
export const leadTaskInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('add'),kind,leadId:id,id,title,dueDate:due}).strict(),
 z.object({action:z.literal('set_done'),kind,leadId:id,id,done:z.boolean(),revision:z.number().int().min(1)}).strict(),
 z.object({action:z.literal('edit'),kind,leadId:id,id,title,dueDate:due,revision:z.number().int().min(1)}).strict(),
 z.object({action:z.literal('remove'),kind,leadId:id,id,revision:z.number().int().min(1)}).strict(),
]);
export type LeadTaskInput=z.infer<typeof leadTaskInputSchema>;
export const leadWorkQuerySchema=z.object({kind,leadId:id}).strict();
export const leadFileSchema=z.object({id,purpose:z.enum(leadFilePurposes),name:z.string().min(1).max(160),mimeType:z.string().min(3).max(100),sizeBytes:z.number().int().positive(),createdAt:z.string().min(10)}).strict();
export type LeadFile=z.infer<typeof leadFileSchema>;
export const leadFilesSchema=z.object({kind,leadId:id,items:z.array(leadFileSchema).max(300)}).strict();
export type LeadFiles=z.infer<typeof leadFilesSchema>;
export const leadFilesQuerySchema=z.object({kind,leadId:id}).strict();
export const leadFileDownloadQuerySchema=z.object({fileId:id}).strict();
export const leadFileRemoveSchema=z.object({action:z.literal('remove'),kind,leadId:id,id}).strict();
export const leadDeleteInputSchema=z.object({kind:z.literal('manual'),leadId:id}).strict();
export const LEAD_FILE_LIMIT=300;
export function leadFileExtension(name:string){const m=/\.([A-Za-z0-9]{1,5})$/.exec(name);return m?m[1].toLowerCase():'';}
export function leadFileKindLabel(mime:string){
 if(mime==='application/pdf')return 'PDF';if(mime.startsWith('image/vnd.dwg'))return 'DWG';if(mime.startsWith('image/vnd.dxf'))return 'DXF';
 if(mime.startsWith('image/'))return 'JPG';if(mime.startsWith('video/'))return 'Video';if(mime.includes('wordprocessingml'))return 'DOCX';if(mime.includes('spreadsheetml'))return 'XLSX';if(mime.includes('presentationml'))return 'PPTX';
 return mime==='text/csv'?'CSV':'TXT';
}
export function leadFileSizeLabel(bytes:number){return bytes<1024?bytes+' B':bytes<1048576?(bytes/1024).toFixed(1)+' KB':(bytes/1048576).toFixed(1)+' MB';}
