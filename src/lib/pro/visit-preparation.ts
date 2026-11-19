import {z} from 'zod';
export const preparationQuestionSchema=z.object({id:z.string().uuid(),label:z.string().trim().min(1).max(160),service:z.string().trim().max(160),required:z.boolean()}).strict();
const settingsObject=z.object({revision:z.number().int().nonnegative(),bufferMinutes:z.number().int().min(0).max(180).multipleOf(15),noticeMinutes:z.number().int().min(15).max(10080).multipleOf(15),questions:z.array(preparationQuestionSchema).max(3)}).strict();
export const visitSettingsSchema=settingsObject.refine(value=>new Set(value.questions.map(q=>q.id)).size===value.questions.length,'Las preguntas deben ser diferentes.');
export const visitPreparationMutationSchema=z.discriminatedUnion('action',[
 settingsObject.extend({action:z.literal('settings'),actionId:z.string().uuid()}).strict(),
 z.object({action:z.literal('answers'),requestId:z.string().uuid(),actionId:z.string().uuid(),revision:z.number().int().nonnegative(),answers:z.array(z.object({id:z.string().uuid(),value:z.string().trim().max(500)}).strict()).max(3)}).strict(),
]).superRefine((value,ctx)=>{const rows=value.action==='settings'?value.questions:value.answers;if(new Set(rows.map(row=>row.id)).size!==rows.length)ctx.addIssue({code:'custom',path:[value.action==='settings'?'questions':'answers'],message:'No repita preguntas o respuestas.'});});
export type PreparationQuestion=z.infer<typeof preparationQuestionSchema>;
export type VisitSettings={revision:number;bufferMinutes:number;noticeMinutes:number;questions:PreparationQuestion[]};
export type VisitPreparation={requestId:string;requestRevision:number;revision:number;questions:PreparationQuestion[];answers:{id:string;value:string}[];editable:boolean;side:'provider'|'client';history:{revision:number;at:string;answers:{id:string;value:string}[]}[]};
