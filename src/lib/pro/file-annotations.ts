import {z} from 'zod';
/**
 * Row 30 (Ronda F2-E): annotations on files. A pin (normalized coordinate on a photo or on one page of a PDF) or a plain note is
 * a PRIVATE comment of the team. Immutable history, idempotent by actionId. Contracts shared by /api/pro/file-annotations,
 * the screen and the specs. Coordinates are fractions of the page or image (0..1), so they survive any zoom or screen size.
 */
export const ANNOTATION_MAX_CHARS=1000;
export const ANNOTATION_PIN_MIMES=['image/jpeg','image/png','image/webp','application/pdf'] as const;
const id=z.string().uuid(),body=z.string().trim().min(1).max(ANNOTATION_MAX_CHARS).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v)),unit=z.number().min(0).max(1),work=z.string().trim().min(1).max(160);
export const annotationSchema=z.object({id,scope:z.enum(['work','company']),fileId:id,workId:z.string().nullable(),kind:z.enum(['pin','note']),page:z.number().int().min(1).max(2000).nullable(),x:z.number().min(0).max(1).nullable(),y:z.number().min(0).max(1).nullable(),body:z.string(),authorName:z.string(),at:z.string()}).strict();
export type FileAnnotation=z.infer<typeof annotationSchema>;
export const annotationsReadSchema=z.object({mimeType:z.string(),pinnable:z.boolean(),items:z.array(annotationSchema).max(500)}).strict();
export const annotationCreateResultSchema=z.object({annotation:annotationSchema,replayed:z.boolean()}).strict();
export const annotationQuerySchema=z.discriminatedUnion('scope',[
 z.object({scope:z.literal('work'),workId:work,fileId:id}).strict(),
 z.object({scope:z.literal('company'),fileId:id}).strict(),
]);
export const annotationInputSchema=z.union([
 z.object({action:z.literal('create'),actionId:id,scope:z.literal('work'),workId:work,fileId:id,kind:z.literal('note'),body}).strict(),
 z.object({action:z.literal('create'),actionId:id,scope:z.literal('work'),workId:work,fileId:id,kind:z.literal('pin'),page:z.number().int().min(1).max(2000),x:unit,y:unit,body}).strict(),
 z.object({action:z.literal('create'),actionId:id,scope:z.literal('company'),fileId:id,kind:z.literal('note'),body}).strict(),
 z.object({action:z.literal('create'),actionId:id,scope:z.literal('company'),fileId:id,kind:z.literal('pin'),page:z.number().int().min(1).max(2000),x:unit,y:unit,body}).strict(),
]);
export type AnnotationInput=
 |{action:'create';actionId:string;scope:'work';workId:string;fileId:string;kind:'note';body:string}
 |{action:'create';actionId:string;scope:'work';workId:string;fileId:string;kind:'pin';page:number;x:number;y:number;body:string}
 |{action:'create';actionId:string;scope:'company';fileId:string;kind:'note';body:string}
 |{action:'create';actionId:string;scope:'company';fileId:string;kind:'pin';page:number;x:number;y:number;body:string};
export function canPin(mimeType:string){return (ANNOTATION_PIN_MIMES as readonly string[]).includes(mimeType);}
