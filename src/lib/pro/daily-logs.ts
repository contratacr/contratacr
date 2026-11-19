import {z} from 'zod';
import {taskDueDate} from './work-tasks';
const id=z.string().uuid(),workId=z.string().min(1).max(160),revision=z.number().int().nonnegative().max(2147483647),inputRevision=z.number().int().nonnegative().max(2147483646),stamp=z.string().datetime({offset:true}),title=z.string().trim().min(1).max(160),summary=z.string().trim().max(2000),date=taskDueDate.unwrap(),ids=z.array(id).max(100).refine(a=>new Set(a).size===a.length);
export const dailyLogSectionsSchema=z.object({weather:z.boolean(),plan:z.boolean(),tasks:z.boolean(),time:z.boolean()}).strict();
export const dailyLogWeatherSchema=z.object({condition:z.enum(['clear','cloudy','rain','other']),temperatureC:z.number().finite().min(-20).max(60).nullable(),note:z.string().trim().max(300)}).strict();
export const dailyLogTaskSchema=z.object({id,title,status:z.enum(['open','done']),dueDate:taskDueDate,revision:revision.refine(v=>v>0)}).strict();
export const dailyLogPlanSchema=z.object({taskId:id,title,phaseId:id.nullable(),phaseTitle:z.string().min(1).max(160).nullable(),plannedStart:taskDueDate,plannedEnd:taskDueDate,dependsOn:z.array(z.object({taskId:id,title:z.string().min(1).max(160).nullable(),status:z.enum(['open','done']).nullable(),available:z.boolean()}).strict()).max(5)}).strict().refine(v=>(v.plannedStart===null)===(v.plannedEnd===null)&&(v.plannedStart===null||v.plannedEnd!==null&&v.plannedStart<=v.plannedEnd));
export const dailyLogSnapshotSchema=z.object({date,tasks:z.array(dailyLogTaskSchema).max(100),plan:z.array(dailyLogPlanSchema).max(100),minutes:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),fingerprint:z.string().regex(/^[a-f0-9]{32}$/)}).strict().refine(v=>new Set(v.tasks.map(t=>t.id)).size===v.tasks.length&&new Set(v.plan.map(t=>t.taskId)).size===v.plan.length);
type DailyLogContent={date:string;sections:z.infer<typeof dailyLogSectionsSchema>;weather:z.infer<typeof dailyLogWeatherSchema>|null;snapshot:z.infer<typeof dailyLogSnapshotSchema>};
function checkDailyContent(v:DailyLogContent,c:z.RefinementCtx){if(v.snapshot.date!==v.date||!v.sections.weather&&v.weather!==null||!v.sections.tasks&&v.snapshot.tasks.length>0||!v.sections.plan&&v.snapshot.plan.length>0||v.sections.time!==(v.snapshot.minutes!==null))c.addIssue({code:'custom',message:'Invalid daily log content.'});}
export const dailyLogSchema=z.object({id,ownerId:id,workId,date,title,summary,sections:dailyLogSectionsSchema,weather:dailyLogWeatherSchema.nullable(),snapshot:dailyLogSnapshotSchema,revision:revision.refine(v=>v>0),createdBy:id,createdByName:z.string().max(160),createdGrantId:id.nullable(),sourceInviteId:id.nullable(),createdAt:stamp,updatedAt:stamp,publishedRevision:revision.refine(v=>v>0).nullable(),archived:z.boolean()}).strict().superRefine((v,c)=>{checkDailyContent(v,c);if(v.publishedRevision!==null&&v.publishedRevision>v.revision||(v.createdGrantId===null)!==(v.sourceInviteId===null))c.addIssue({code:'custom',message:'Invalid daily log identity.'});});
const dailyLogVersionBaseSchema=z.object({id,version:revision.refine(v=>v>0),date,title,summary,sections:dailyLogSectionsSchema,weather:dailyLogWeatherSchema.nullable(),snapshot:dailyLogSnapshotSchema,service:z.string().min(1).max(160),authorName:z.string().max(160),publishedAt:stamp}).strict();
export const dailyLogVersionSchema=dailyLogVersionBaseSchema.superRefine(checkDailyContent);
export const dailyLogDefaultsSchema=z.object({revision,summary,sections:dailyLogSectionsSchema}).strict();
const scope={workId,grantId:id.nullable()},base={...scope,actionId:id,logId:id,revision:inputRevision};
const capture=z.object({mode:z.literal('capture'),taskIds:ids,planTaskIds:ids,fingerprint:z.string().regex(/^[a-f0-9]{32}$/)}).strict();
const source=z.discriminatedUnion('mode',[capture,z.object({mode:z.literal('keep')}).strict()]);
const body={date,title,summary,sections:dailyLogSectionsSchema,weather:dailyLogWeatherSchema.nullable()};
export const dailyLogMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,...body,action:z.literal('create'),revision:z.literal(0),source:capture}).strict(),
 z.object({...base,...body,action:z.literal('update'),revision:inputRevision.refine(v=>v>0),source}).strict(),
 z.object({...base,action:z.literal('duplicate'),revision:inputRevision.refine(v=>v>0),targetLogId:id}).strict(),
 z.object({...base,action:z.enum(['archive','restore']),revision:inputRevision.refine(v=>v>0)}).strict(),
 z.object({...base,action:z.literal('publish'),revision:inputRevision.refine(v=>v>0),client:z.object({requestId:id,recipientId:id}).strict().nullable(),team:z.array(z.object({grantId:id,sourceInviteId:id}).strict()).max(100).refine(a=>new Set(a.map(t=>t.grantId)).size===a.length)}).strict(),
 z.object({action:z.literal('defaults_save'),actionId:id,revision:inputRevision,summary,sections:dailyLogSectionsSchema}).strict(),
]).superRefine((v,c)=>{if(v.action==='create'||v.action==='update'){if(!v.sections.weather&&v.weather!==null||v.source.mode==='capture'&&(!v.sections.tasks&&v.source.taskIds.length>0||!v.sections.plan&&v.source.planTaskIds.length>0))c.addIssue({code:'custom',message:'Disabled sections must be empty.'});}if(v.action==='publish'&&(v.grantId!==null||v.client===null&&v.team.length===0))c.addIssue({code:'custom',message:'Choose a publication audience.'});if(v.action==='duplicate'&&v.logId===v.targetLogId)c.addIssue({code:'custom',message:'Choose a new log identity.'});});
export const dailyLogResultSchema=z.discriminatedUnion('action',[
 z.object({action:z.enum(['create','update','duplicate','archive','restore']),log:dailyLogSchema}).strict(),
 z.object({action:z.literal('publish'),log:dailyLogSchema,version:dailyLogVersionSchema}).strict(),
 z.object({action:z.literal('defaults_save'),defaults:dailyLogDefaultsSchema}).strict(),
]);
export const dailyLogReceiptSchema=z.object({receipt:z.object({input:dailyLogMutationSchema,result:dailyLogResultSchema}).strict().nullable()}).strict();
export const dailyLogsPageSchema=z.object({ownerId:id,workId,items:z.array(dailyLogSchema).max(20),nextCursor:id.nullable(),canCreate:z.boolean(),canPublish:z.boolean()}).strict();
export const dailyLogDetailSchema=z.object({log:dailyLogSchema,history:z.array(z.object({actionId:id,actorId:id,actorName:z.string().max(160),action:z.enum(['create','update','duplicate','archive','restore','publish']),at:stamp,before:dailyLogSchema.nullable(),after:dailyLogSchema}).strict()).max(20),canEdit:z.boolean(),canPublish:z.boolean(),requestId:id.nullable(),recipientId:id.nullable(),recipientName:z.string().max(160).nullable()}).strict();
export const dailyLogSharedPageSchema=z.object({ownerId:id,workId,items:z.array(dailyLogVersionSchema).max(20),nextCursor:id.nullable()}).strict();
export const dailyLogOptionsPageSchema=z.object({items:z.array(z.object({id,title}).strict()).max(20),nextCursor:id.nullable()}).strict();
export const dailyLogPreviewSchema=z.object({logId:id,revision:revision.refine(v=>v>0),content:dailyLogVersionBaseSchema.omit({version:true,publishedAt:true}).superRefine(checkDailyContent),requestId:id.nullable(),recipientId:id.nullable(),recipientName:z.string().max(160).nullable(),team:z.array(z.object({grantId:id,sourceInviteId:id,name:z.string().max(160)}).strict()).max(100)}).strict();
export type DailyLog=z.infer<typeof dailyLogSchema>;
export type DailyLogMutation=z.infer<typeof dailyLogMutationSchema>;
export type DailyLogResult=z.infer<typeof dailyLogResultSchema>;
export type DailyLogSnapshot=z.infer<typeof dailyLogSnapshotSchema>;
export type DailyLogVersion=z.infer<typeof dailyLogVersionSchema>;
export type DailyLogDefaults=z.infer<typeof dailyLogDefaultsSchema>;

export const dailyLogAudiencePageSchema=z.object({items:z.array(z.object({grantId:id,sourceInviteId:id,name:z.string().max(160)}).strict()).max(20),nextCursor:id.nullable()}).strict();
