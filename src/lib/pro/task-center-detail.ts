import {z} from 'zod';
const id=z.string().uuid(),workId=z.string().min(1).max(160);
export const taskDetailSchema=z.object({workId,taskId:id,
 people:z.array(z.object({key:z.string(),personId:id,name:z.string(),role:z.string()}).strict()),
 comments:z.array(z.object({id,authorName:z.string(),body:z.string(),mentions:z.array(z.object({personId:id,name:z.string()}).strict()).max(5),at:z.string(),edited:z.boolean(),deleted:z.boolean(),canManage:z.boolean()}).strict()).max(30),
 files:z.array(z.object({fileId:id,name:z.string(),mimeType:z.string(),sizeBytes:z.number().int(),linkedByName:z.string(),linkedAt:z.string()}).strict()).max(20),
 available:z.array(z.object({fileId:id,name:z.string(),mimeType:z.string(),sizeBytes:z.number().int()}).strict()).max(20)}).strict();
export type TaskDetail=z.infer<typeof taskDetailSchema>;
export const taskCommentSchema=z.object({actionId:id,workId,taskId:id,text:z.string().trim().min(1).max(1000),mentions:z.array(id).max(5).refine(m=>new Set(m).size===m.length)}).strict();
export const taskFileLinkSchema=z.object({actionId:id,workId,taskId:id,fileId:id,action:z.enum(['link','unlink'])}).strict();
export const taskCommentChangeSchema=z.union([z.object({action:z.literal('edit'),actionId:id,workId,taskId:id,commentId:id,text:z.string().trim().min(1).max(1000)}).strict(),z.object({action:z.literal('delete'),actionId:id,workId,taskId:id,commentId:id}).strict()]);
export const taskDetailMutationSchema=z.union([z.object({kind:z.literal('comment-change')}).extend({action:z.enum(['edit','delete']),actionId:id,workId,taskId:id,commentId:id,text:z.string().trim().min(1).max(1000).optional()}).strict().refine(v=>v.action==='edit'?!!v.text:v.text===undefined),z.object({kind:z.literal('comment')}).extend(taskCommentSchema.shape).strict(),z.object({kind:z.literal('file')}).extend(taskFileLinkSchema.shape).strict()]);
/** CSV of task rows (row 15). Semicolon separator and BOM for Excel in es-CR; formula injection neutralised. */
export type TaskCsvRow={title:string;job:string;customer:string;dueDate:string|null;status:'open'|'done';assignee:string;phase?:string|null;plannedStart?:string|null;plannedEnd?:string|null};
export function taskRowsMatrix(rows:TaskCsvRow[],english:boolean):string[][]{
 const head=english?['Task','Job','Customer','Due date','Status','Assignee','Phase','Planned start','Planned end']:['Tarea','Trabajo','Cliente','Fecha límite','Estado','Responsable','Fase','Inicio previsto','Fin previsto'];
 return [head,...rows.map(r=>[r.title,r.job,r.customer,r.dueDate??'',r.status==='done'?(english?'Completed':'Completada'):(english?'Pending':'Pendiente'),r.assignee,r.phase??'',r.plannedStart??'',r.plannedEnd??''])];
}
export function taskRowsCsv(rows:TaskCsvRow[],english:boolean):string{
 const q=(v:string|null|undefined)=>{const s=String(v??'');const danger=/^[=+\-@\t\r]/.test(s);const t=danger?"'"+s:s;return /[";\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
 const head=english?['Task','Job','Customer','Due date','Status','Assignee','Phase','Planned start','Planned end']:['Tarea','Trabajo','Cliente','Fecha límite','Estado','Responsable','Fase','Inicio previsto','Fin previsto'];
 const body=rows.map(r=>[r.title,r.job,r.customer,r.dueDate??'',r.status==='done'?(english?'Completed':'Completada'):(english?'Pending':'Pendiente'),r.assignee,r.phase??'',r.plannedStart??'',r.plannedEnd??''].map(q).join(';'));
 return '﻿'+[head.map(q).join(';'),...body].join('\r\n')+'\r\n';
}
