import {z} from 'zod';

/**
 * Round 5: «Plan de pagos» — the professional's own installment plan for a job (payment-plans-local.sql).
 * ContrataCR never lends: no interest, no third party. The plan only schedules the customer balance of the
 * single formula (pro_work_account); payments of the job ledger are applied oldest-first on every read.
 */
const cents=z.number().int().safe(),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/),stamp=z.string().min(1).max(64),id=z.string().uuid();
export const paymentPlanFrequencies=['weekly','biweekly','monthly'] as const;
export type PaymentPlanFrequency=typeof paymentPlanFrequencies[number];
export const paymentPlanStatuses=['pending','partial','paid','overdue'] as const;
export type PaymentPlanStatus=typeof paymentPlanStatuses[number];

const linkSchema=z.object({kind:z.enum(['milestone','task']),id,title:z.string().nullable(),available:z.boolean(),done:z.boolean().nullable()}).strict();
export const paymentPlanItemSchema=z.object({seq:z.number().int().min(0).max(60),kind:z.enum(['down','installment']),amountCents:cents,dueDate:day.nullable(),link:linkSchema.nullable(),
 appliedCents:cents,status:z.enum(paymentPlanStatuses),invoiceDraftId:id.nullable()}).strict();
export type PaymentPlanItem=z.infer<typeof paymentPlanItemSchema>;
const noticesSchema=z.object({overdueCount:z.number().int().nonnegative(),overdueCents:cents,upcomingCount:z.number().int().nonnegative(),upcomingCents:cents,nextDue:day.nullable()}).strict();
const acceptanceSchema=z.object({revision:z.number().int().positive(),acceptedAt:stamp}).strict();
export const paymentPlanStateSchema=z.object({planId:id,workId:z.string(),status:z.enum(['active','cancelled']),revision:z.number().int().positive(),createdAt:stamp,updatedAt:stamp,
 cancelledAt:stamp.nullable(),cancelReason:z.string().nullable(),totalCents:cents,downPaymentCents:cents,frequency:z.enum(['weekly','biweekly','monthly','custom']),feeCents:cents,lateFeeCents:cents,
 terms:z.string().max(1000),contentHash:z.string().regex(/^[a-f0-9]{64}$/),revisionCreatedAt:stamp,appliedCents:cents,remainingCents:cents,customerBalanceCents:cents.nullable(),
 items:z.array(paymentPlanItemSchema).max(61),today:day,notices:noticesSchema,acceptance:acceptanceSchema.nullable(),lastAcceptance:acceptanceSchema.nullable()}).strict();
export type PaymentPlanState=z.infer<typeof paymentPlanStateSchema>;

export const paymentPlanReadSchema=z.object({workId:z.string(),workTitle:z.string(),clientName:z.string().nullable(),cancelled:z.boolean(),clientArchived:z.boolean(),today:day,
 account:z.object({agreedCents:cents.nullable(),paidCents:cents,customerBalanceCents:cents.nullable()}).strict(),
 plan:paymentPlanStateSchema.nullable(),
 revisions:z.array(z.object({revision:z.number().int().positive(),totalCents:cents,createdAt:stamp,accepted:z.boolean()}).strict()).max(1000),
 history:z.array(z.object({action:z.enum(['create','edit','cancel','accept','invoice']),revision:z.number().int(),at:stamp,byClient:z.boolean()}).strict()).max(30),
 cancelledPlans:z.array(z.object({planId:id,cancelledAt:stamp,reason:z.string().nullable(),revision:z.number().int(),totalCents:cents}).strict()).max(10),
 options:z.object({milestones:z.array(z.object({id,title:z.string(),date:day}).strict()).max(100),tasks:z.array(z.object({id,title:z.string(),status:z.enum(['open','done']),dueDate:day.nullable()}).strict()).max(100)}).strict(),
 linkedClient:z.object({name:z.string()}).strict().nullable(),showInClientView:z.boolean()}).strict();
export type PaymentPlanRead=z.infer<typeof paymentPlanReadSchema>;

export const paymentPlanNoticesSchema=z.object({active:z.boolean(),awaitingAcceptance:z.boolean()}).merge(noticesSchema).strict();
export type PaymentPlanNotices=z.infer<typeof paymentPlanNoticesSchema>;

export const clientPaymentPlanBodySchema=z.object({planId:id,revision:z.number().int().positive(),totalCents:cents,downPaymentCents:cents,frequency:z.enum(['weekly','biweekly','monthly','custom']),
  feeCents:cents,lateFeeCents:cents,terms:z.string().max(1000),contentHash:z.string().regex(/^[a-f0-9]{64}$/),appliedCents:cents,remainingCents:cents,today:day,revisionCreatedAt:stamp,
  items:z.array(z.object({seq:z.number().int().min(0).max(60),kind:z.enum(['down','installment']),amountCents:cents,dueDate:day.nullable(),appliedCents:cents,status:z.enum(paymentPlanStatuses),
   link:z.object({kind:z.enum(['milestone','task']),title:z.string().nullable()}).strict().nullable()}).strict()).max(61),
  acceptance:acceptanceSchema.nullable(),canAccept:z.boolean()}).strict();
export type ClientPaymentPlanBody=z.infer<typeof clientPaymentPlanBodySchema>;
/** Customer copy: strict on purpose (no base, invoice, milestone/task ids or task names). */
export const clientPaymentPlanSchema=z.discriminatedUnion('visible',[
 z.object({visible:z.literal(false)}).strict(),
 z.object({visible:z.literal(true),workTitle:z.string().max(300),plan:clientPaymentPlanBodySchema.nullable()}).strict(),
]);
export type ClientPaymentPlan=z.infer<typeof clientPaymentPlanSchema>;

const amount=z.number().int().min(0).max(10000000000);
const customItem=z.object({amountCents:z.number().int().min(1).max(10000000000),dueDate:day.nullable(),milestoneId:id.nullable(),taskId:id.nullable()}).strict()
 .refine(v=>[v.dueDate,v.milestoneId,v.taskId].filter(x=>x!==null).length===1,'Una fecha, un hito o una tarea por cuota.');
export const paymentPlanScheduleSchema=z.discriminatedUnion('mode',[
 z.object({mode:z.literal('auto'),frequency:z.enum(paymentPlanFrequencies),count:z.number().int().min(1).max(60),firstDue:day}).strict(),
 z.object({mode:z.literal('custom'),items:z.array(customItem).min(1).max(60)}).strict(),
]);
export type PaymentPlanSchedule=z.infer<typeof paymentPlanScheduleSchema>;
const terms={totalCents:z.number().int().min(100).max(10000000000),downPaymentCents:amount,downPaymentDate:day.nullable(),schedule:paymentPlanScheduleSchema,feeCents:z.number().int().min(0).max(1000000000),lateFeeCents:z.number().int().min(0).max(1000000000),terms:z.string().max(1000)};
const base={actionId:id,workId:z.string().trim().min(1).max(160),planId:id};
export const paymentPlanMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),...base,...terms}).strict(),
 z.object({action:z.literal('edit'),...base,revision:z.number().int().positive().max(100000),...terms}).strict(),
 z.object({action:z.literal('cancel'),...base,revision:z.number().int().positive().max(100000),reason:z.string().trim().min(1).max(500)}).strict(),
 z.object({action:z.literal('invoice'),...base,revision:z.number().int().positive().max(100000),seq:z.number().int().min(0).max(60),language:z.enum(['es','en'])}).strict(),
]);
export type PaymentPlanMutation=z.infer<typeof paymentPlanMutationSchema>;
export const paymentPlanAcceptSchema=z.object({action:z.literal('accept'),actionId:id,requestId:id,planId:id,revision:z.number().int().positive().max(100000),contentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type PaymentPlanAccept=z.infer<typeof paymentPlanAcceptSchema>;

/** Same split as the server (pro_payment_plan_split): whole colones, the LAST installment absorbs the rounding. */
export function paymentPlanSplit(totalCents:number,downCents:number,count:number):number[]|null{
 const remaining=totalCents-downCents;if(!Number.isInteger(count)||count<1||count>60||remaining<=0)return null;
 const base=Math.floor(remaining/count/100)*100;if(base<100)return null;
 return [...Array(count-1).fill(base),remaining-base*(count-1)];
}
/** Same due dates as the server (pro_payment_plan_due); month steps keep the day or clamp to the month end. */
export function paymentPlanDue(first:string,frequency:PaymentPlanFrequency,index:number){
 const [y,m,d]=first.split('-').map(Number);
 if(frequency!=='monthly'){const date=new Date(Date.UTC(y,m-1,d+(frequency==='weekly'?7:14)*index));return date.toISOString().slice(0,10);}
 const month=m-1+index,last=new Date(Date.UTC(y,month+1,0)).getUTCDate();return new Date(Date.UTC(y,month,Math.min(d,last))).toISOString().slice(0,10);
}
/** Colones typed in the page language ("150.000,50" es / "150,000.50" en / "150000") → cents; null when invalid. */
export function colonesToCents(value:string,en:boolean){
 let clean=value.trim().replace(/\s/g,'');clean=en?clean.replace(/,(?=\d{3}(\D|$))/g,''):clean.replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.');
 if(!/^\d{1,9}(\.\d{1,2})?$/.test(clean))return null;const [whole,fraction='']=clean.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
export function centsToColones(value:number,en:boolean){const text=Number.isInteger(value/100)?String(value/100):(value/100).toFixed(2);return en?text:text.replace('.',',');}

/** ES/EN labels shared by the owner screen and the customer view. */
export function paymentPlanLabels(t:(es:string,en:string)=>string){
 return{status:{pending:t('Pendiente','Pending'),partial:t('Abonada en parte','Partially paid'),paid:t('Pagada','Paid'),overdue:t('Vencida','Overdue')} as Record<PaymentPlanStatus,string>,
  frequency:{weekly:t('Semanal','Weekly'),biweekly:t('Quincenal','Every two weeks'),monthly:t('Mensual','Monthly'),custom:t('Fechas a la medida','Custom dates')} as Record<string,string>};
}

/** Delinquency (mora) state and reminder log of the installment plans (migration 382). */
export const moraKinds=['upcoming','late_light','late_moderate','late_severe'] as const;
export type MoraKind=typeof moraKinds[number];
export const paymentPlanMoraSchema=z.object({today:day,workId:z.string().nullable(),
 summary:z.object({lateCount:z.number().int().nonnegative(),lateCents:cents,lateFeeCents:cents,upcomingCount:z.number().int().nonnegative(),upcomingCents:cents,worstDays:z.number().int().nonnegative(),
  clientCount:z.number().int().nonnegative(),worstLevel:z.enum(['late_light','late_moderate','late_severe']).nullable()}).strict(),
 rows:z.array(z.object({workId:z.string(),workTitle:z.string().nullable(),clientId:z.string().nullable(),clientName:z.string().nullable(),planId:id,revision:z.number().int().positive(),seq:z.number().int().nonnegative(),
  itemKind:z.enum(['down','installment']),dueDate:day,daysOverdue:z.number().int().nonnegative(),pendingCents:cents,lateFeeCents:cents,kind:z.enum(moraKinds),hasEmail:z.boolean(),hasPhone:z.boolean()}).strict()).max(500),
 reminders:z.array(z.object({id:id,workId:z.string(),planId:id,seq:z.number().int().nonnegative(),kind:z.enum(moraKinds),channel:z.enum(['app','email','sms']),status:z.enum(['recorded','queued','sandbox_sent','failed']),
  dueDate:day,pendingCents:cents,daysOverdue:z.number().int().nonnegative(),createdAt:stamp,sentAt:stamp.nullable(),providerRef:z.string().nullable(),clientName:z.string().nullable()}).strict()).max(50),
}).strict();
export type PaymentPlanMora=z.infer<typeof paymentPlanMoraSchema>;
export const paymentPlanReminderResultSchema=z.object({created:z.number().int().nonnegative(),app:z.number().int().nonnegative(),email:z.number().int().nonnegative(),sms:z.number().int().nonnegative(),
 withoutContact:z.number().int().nonnegative(),mode:z.enum(['sandbox','live']),sent:z.number().int().nonnegative(),failed:z.number().int().nonnegative()}).strict();
