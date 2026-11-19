import {z} from 'zod';
const workId=z.string().trim().min(1).max(160);
/** A civil date, never converted through the browser's timezone. */
export const taskDueDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value&&value>='1900-01-01'&&value<='2100-12-31';
},'Fecha inválida.').nullable();
const content={title:z.string().trim().min(1).max(160),details:z.string().trim().max(2000),dueDate:taskDueDate,assignee:z.string().trim().max(160)};
const base={workId,taskId:z.string().uuid(),actionId:z.string().uuid(),revision:z.number().int().min(0).max(2147483646)};
export const workTaskMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,...content,action:z.literal('create'),revision:z.literal(0)}).strict(),
 z.object({...base,...content,action:z.literal('update'),revision:z.number().int().positive().max(2147483646)}).strict(),
 z.object({...base,action:z.enum(['complete','reopen','archive','restore']),revision:z.number().int().positive().max(2147483646)}).strict(),
]);
export type WorkTaskMutation=z.infer<typeof workTaskMutationSchema>;
export const workTaskSchema=z.object({id:z.string().uuid(),workId,title:content.title,details:content.details,dueDate:taskDueDate,assignee:content.assignee,status:z.enum(['open','done']),archived:z.boolean(),revision:z.number().int().positive(),createdAt:z.string(),updatedAt:z.string()});
export type WorkTask=z.infer<typeof workTaskSchema>;
export const workTasksPageSchema=z.object({workId,items:z.array(workTaskSchema).max(20),nextCursor:z.string().uuid().nullable(),counts:z.object({open:z.number().int().nonnegative(),done:z.number().int().nonnegative()})});
export type WorkTasksPage=z.infer<typeof workTasksPageSchema>;
export type WorkTaskHistory={actionId:string;at:string;action:WorkTaskMutation['action'];before:WorkTask|null;after:WorkTask};
export type WorkTaskDetail={task:WorkTask;history:WorkTaskHistory[]};
