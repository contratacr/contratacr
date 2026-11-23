import {z} from 'zod';

/**
 * Ronda F2-B (rows 07, 08): stage colour and win probability, stage spans (time in stage), weighted forecast
 * and the funnel by stage reached. Strict contracts shared by the API route, the UI and the SQL test.
 */
export const stageColors=['slate','blue','cyan','teal','green','lime','amber','orange','red','pink','violet','indigo'] as const;
export type StageColor=typeof stageColors[number];
/** Visual tokens per palette key (dot/bar, soft background, readable text). Contrast checked against white. */
export const stageColorTokens:Record<StageColor,{bar:string;soft:string;text:string}>={
 slate:{bar:'#64748b',soft:'#f1f5f9',text:'#334155'},blue:{bar:'#2563eb',soft:'#eff4ff',text:'#1d4ed8'},cyan:{bar:'#0891b2',soft:'#ecfbfe',text:'#0e7490'},
 teal:{bar:'#0d9488',soft:'#edfbf8',text:'#0f766e'},green:{bar:'#16a34a',soft:'#effbf3',text:'#15803d'},lime:{bar:'#65a30d',soft:'#f5fbe9',text:'#4d7c0f'},
 amber:{bar:'#d97706',soft:'#fff8eb',text:'#b45309'},orange:{bar:'#ea580c',soft:'#fff4ed',text:'#c2410c'},red:{bar:'#dc2626',soft:'#fef1f1',text:'#b91c1c'},
 pink:{bar:'#db2777',soft:'#fdf0f6',text:'#be185d'},violet:{bar:'#7c3aed',soft:'#f5f1ff',text:'#6d28d9'},indigo:{bar:'#4f46e5',soft:'#f0f0ff',text:'#4338ca'},
};
const nint=z.number().int().nonnegative(),uuid=z.string().uuid(),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/),stamp=z.string().min(10),stageId=z.string().min(1).max(80);
const hours=z.number().nonnegative().nullable(),pct=z.number().min(0).nullable();
export const stageSettingSchema=z.object({id:stageId,builtin:z.boolean(),name:z.string().nullable(),position:z.number().int().min(0).max(17),hidden:z.boolean(),color:z.enum(stageColors),probability:z.number().int().min(0).max(100),customized:z.boolean()}).strict();
export const stageSettingsSchema=z.object({revision:nint,catalogRevision:nint,stages:z.array(stageSettingSchema).min(6).max(18)}).strict();
export const stageSettingsInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('style'),actionId:uuid,revision:nint,stageId,color:z.enum(stageColors),probability:z.number().int().min(0).max(100)}).strict(),
 z.object({action:z.literal('reset'),actionId:uuid,revision:nint,stageId}).strict(),
]);
export const stageSettingsResultSchema=z.object({action:z.enum(['style','reset']),revision:z.number().int().positive(),stage:stageSettingSchema,replayed:z.literal(true).optional()}).strict();
const moneyRow=z.object({currency:z.string().min(3).max(3),totalCents:z.number().int(),weightedCents:z.number().int()}).strict();
export const pipelineForecastSchema=z.object({revision:nint,
 stages:z.array(z.object({stageId,probability:z.number().int().min(0).max(100),count:nint,withValue:nint,avgHours:hours,values:z.array(moneyRow)}).strict()),
 totals:z.array(z.object({currency:z.string().min(3).max(3),openCents:z.number().int(),weightedCents:z.number().int(),wonCents:z.number().int()}).strict()),withoutValue:nint}).strict();
export const stageSpanSchema=z.object({seq:z.number().int().positive(),stageId,enteredAt:stamp,leftAt:stamp.nullable(),hours:z.number().nonnegative(),source:z.enum(['created','moved','observed','backfill'])}).strict();
export const leadStageHistorySchema=z.object({kind:z.enum(['manual','request']),id:uuid,spans:z.array(stageSpanSchema)}).strict();
export const stageFunnelSchema=z.object({from:day,to:day,channel:z.string().nullable(),received:nint,won:nint,lost:nint,converted:nint,observedSince:stamp.nullable(),backfilled:nint,
 stages:z.array(z.object({stageId,reached:nint,current:nint,avgHours:hours,medianHours:hours,completedSpans:nint,fromStart:pct,fromPrevious:pct}).strict())}).strict();
export type StageSetting=z.infer<typeof stageSettingSchema>;
export type StageSettings=z.infer<typeof stageSettingsSchema>;
export type StageSettingsInput=z.infer<typeof stageSettingsInputSchema>;
export type PipelineForecast=z.infer<typeof pipelineForecastSchema>;
export type LeadStageHistory=z.infer<typeof leadStageHistorySchema>;
export type StageFunnel=z.infer<typeof stageFunnelSchema>;

/** "3,5 días" / "3.5 days" (hours under a day stay in hours). */
export function durationLabel(h:number|null,locale:'es'|'en'){
 if(h===null)return '—';const fmt=(n:number)=>new Intl.NumberFormat({es:'es-CR',en:'en-US'}[locale],{maximumFractionDigits:1}).format(n);
 const words={es:{h:['hora','horas'],d:['día','días']},en:{h:['hour','hours'],d:['day','days']}}[locale];
 if(h<1)return {es:'menos de 1 hora',en:'under 1 hour'}[locale];
 if(h<24){const v=Math.round(h*10)/10;return `${fmt(v)} ${v===1?words.h[0]:words.h[1]}`;}const d=Math.round(h/24*10)/10;return `${fmt(d)} ${d===1?words.d[0]:words.d[1]}`;
}

/** Row 07: rules per stage (follow-up N days after a lead enters the stage). Shared by the route, the UI and the specs. */
export const stageRulesReadSchema=z.object({revision:nint,
 rules:z.array(z.object({stageId:stageId,followUpDays:z.number().int().min(1).max(90)}).strict()).max(18),
 due:z.array(z.object({kind:z.enum(['manual','request']),id:uuid,stageId:stageId,title:z.string().max(400),enteredAt:stamp,dueOn:day,daysIn:nint,followUpDays:z.number().int().min(1).max(90)}).strict()).max(100)}).strict();
export const stageRulesInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('set'),actionId:uuid,revision:nint,stageId:stageId,days:z.number().int().min(1).max(90)}).strict(),
 z.object({action:z.literal('clear'),actionId:uuid,revision:nint,stageId:stageId}).strict(),
]);
export const stageRulesResultSchema=z.object({action:z.enum(['set','clear']),revision:nint,stageId:stageId,followUpDays:z.number().int().min(1).max(90).nullable(),replayed:z.boolean().optional()}).strict();
export type StageRulesRead=z.infer<typeof stageRulesReadSchema>;

/** Row 07: expected close date per lead and the forecast grouped by close month (Costa Rica). Shared by the route, the UI and the specs. */
const closeGroup=z.string().regex(/^(overdue|none|\d{4}-\d{2})$/);
export const closeForecastSchema=z.object({today:day,
 groups:z.array(z.object({group:closeGroup,count:nint,values:z.array(moneyRow),withoutValue:nint}).strict()).max(400),
 items:z.array(z.object({kind:z.enum(['manual','request']),id:uuid,title:z.string().max(400),stageId:stageId,probability:z.number().int().min(0).max(100),currency:z.string().length(3).nullable(),
  revenueCents:z.number().int().nullable(),closeOn:day.nullable(),revision:nint}).strict()).max(200)}).strict();
export const closeDateInputSchema=z.object({actionId:uuid,kind:z.enum(['manual','request']),id:uuid,revision:nint,closeOn:day.nullable()}).strict();
export const closeDateResultSchema=z.object({kind:z.enum(['manual','request']),id:uuid,closeOn:day.nullable(),revision:z.number().int().positive(),replayed:z.boolean().optional()}).strict();
export type CloseForecast=z.infer<typeof closeForecastSchema>;
