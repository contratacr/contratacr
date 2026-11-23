import {z} from 'zod';

/**
 * Pro 29 (row 70): campaign builder. A build is a PLAN for a Meta or Google ad (segment, budget, dates, creative and the
 * tracking campaign its link uses). Publishing is sandbox only: nothing reaches an ad platform and no money is spent.
 * Metrics shown next to the plan are SIMULATED and kept apart from the real tracking report.
 */
export const adBuildProvinces=['San José','Alajuela','Cartago','Heredia','Guanacaste','Puntarenas','Limón'] as const;
export const adBuildStatuses=['draft','review','sandbox_published','paused','ended'] as const;
export type AdBuildStatus=typeof adBuildStatuses[number];
const id=z.string().uuid(),revision=z.number().int().min(0).max(2147483646),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const plan={
 name:z.string().trim().min(1).max(120),platform:z.enum(['meta','google']),objective:z.enum(['leads','traffic','calls']),
 province:z.union([z.literal(''),z.enum(adBuildProvinces)]),canton:z.string().trim().max(60),service:z.string().trim().max(120),
 dailyBudgetCents:z.number().int().min(100).max(100000000000),totalBudgetCents:z.number().int().min(100).max(100000000000),
 startOn:day,endOn:day,headline:z.string().trim().max(90),body:z.string().trim().max(500),
 imageUrl:z.union([z.literal(''),z.string().trim().url().max(500).startsWith('https://')]),trackingCampaignId:z.union([z.literal(''),id]),
};
const simple=(action:'submit'|'back_to_draft'|'publish_sandbox'|'pause'|'resume'|'end'|'simulate')=>z.object({action:z.literal(action),id,revision}).strict();
export const adBuildMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),id,revision,...plan}).strict(),
 simple('submit'),simple('back_to_draft'),simple('publish_sandbox'),simple('pause'),simple('resume'),simple('end'),simple('simulate'),
]).refine(v=>v.action!=='save'||v.endOn>=v.startOn&&v.dailyBudgetCents<=v.totalBudgetCents,'Invalid plan');
export type AdBuildInput=z.infer<typeof adBuildMutationSchema>;
export type AdBuild={id:string;name:string;platform:'meta'|'google';objective:'leads'|'traffic'|'calls';province:string;canton:string;service:string;dailyBudgetCents:number;totalBudgetCents:number;startOn:string;endOn:string;headline:string;body:string;imageUrl:string|null;trackingCampaignId:string|null;status:AdBuildStatus;platformRef:string|null;revision:number;updatedAt:string;simulated?:{impressions:number;clicks:number;spendCents:number;days:number}};
export type AdBuilderOverview={builds:AdBuild[];campaigns:{id:string;name:string;code:string}[];mode:string};
const hash=(text:string)=>{let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h>>>0;};
/** Deterministic SIMULATED daily metrics from the plan (no randomness, no platform): same plan, same numbers. */
export function simulateMetrics(build:Pick<AdBuild,'id'|'startOn'|'endOn'|'dailyBudgetCents'|'totalBudgetCents'>,today:string){
 const rows:{day:string;impressions:number;clicks:number;spendCents:number}[]=[];let spent=0;
 const last=today<build.endOn?today:build.endOn;
 for(let d=new Date(build.startOn+'T12:00:00Z');rows.length<370;d=new Date(d.getTime()+86400000)){
  const iso=d.toISOString().slice(0,10);if(iso>last)break;
  const h=hash(build.id+iso),spend=Math.min(build.dailyBudgetCents*(60+h%41)/100|0,build.dailyBudgetCents,build.totalBudgetCents-spent);
  if(spend<=0)break;
  const impressions=Math.max(1,Math.round(spend/100*(18+h%12))),clicks=Math.min(impressions,Math.max(0,Math.round(impressions*(0.012+(h%9)/1000))));
  rows.push({day:iso,impressions,clicks,spendCents:spend});spent+=spend;
 }
 return rows;
}
