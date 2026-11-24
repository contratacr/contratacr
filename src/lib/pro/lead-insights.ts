/**
 * Area E row 19: lead insights computed from the lead metrics ContrataCR already keeps (channel and stage of every lead).
 * Pure helpers: periods, percent change, channel table with the previous period, and the stage funnel.
 * ContrataCR does not record first-response times, estimated revenue or profit per lead, so none of those are invented.
 */
export const insightRanges=['1m','3m','6m','1y'] as const;
export type InsightRange=(typeof insightRanges)[number];
const months:Record<InsightRange,number>={'1m':1,'3m':3,'6m':6,'1y':12};
const pad=(n:number)=>String(n).padStart(2,'0');
const iso=(d:Date)=>`${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
/** Same civil day `back` months earlier (clamped to the end of a shorter month). */
function monthsBefore(day:string,back:number){
 const [y,m,d]=day.split('-').map(Number) as [number,number,number],total=y*12+(m-1)-back,ny=Math.floor(total/12),nm=total%12,last=new Date(Date.UTC(ny,nm+1,0)).getUTCDate();
 return iso(new Date(Date.UTC(ny,nm,Math.min(d,last))));
}
const addDays=(day:string,n:number)=>{const [y,m,d]=day.split('-').map(Number) as [number,number,number];return iso(new Date(Date.UTC(y,m-1,d+n)));};
/** Current period [from,to] ending today and the previous period of the same length right before it. Dates are YYYY-MM-DD. */
export function insightPeriods(range:InsightRange,today:string){
 const from=addDays(monthsBefore(today,months[range]),1),prevTo=addDays(from,-1),prevFrom=addDays(monthsBefore(from,months[range]),0);
 return {current:{from,to:today},previous:{from:prevFrom,to:prevTo}};
}
/** Percent change vs the previous period; null when there is nothing to compare with. */
export function pctChange(current:number,previous:number):number|null{return previous>0?Math.round((current-previous)*1000/previous)/10:null;}
export type ChannelCount={id:string|null;name:string;total:number;won:number};
export type SourceRow={id:string|null;name:string;total:number;previous:number;change:number|null;won:number;share:number};
/** Top sources of the current period with the previous period's count; ties broken by name. */
export function sourceRows(current:ChannelCount[],previous:ChannelCount[],limit=10):SourceRow[]{
 const prev=new Map(previous.map(c=>[c.id??'unspecified',c.total])),sum=current.reduce((s,c)=>s+c.total,0);
 return current.filter(c=>c.total>0).map(c=>({id:c.id,name:c.name,total:c.total,previous:prev.get(c.id??'unspecified')??0,change:pctChange(c.total,prev.get(c.id??'unspecified')??0),won:c.won,share:sum?Math.round(c.total*1000/sum)/10:0}))
  .sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'es')).slice(0,limit);
}
export type FunnelRow={stageId:string;name:string;leads:number;reached:number;rate:number};
/**
 * Funnel by stage: leads that are in this stage or any later visible stage (by position), over all leads.
 * It is based on the stage each lead is in now, not on a history of stage changes.
 */
export function funnelRows(stages:{id:string;position:number;hidden:boolean}[],counts:{stageId:string;count:number}[],nameOf:(id:string)=>string):FunnelRow[]{
 const visible=[...stages].filter(s=>!s.hidden).sort((a,b)=>a.position-b.position),by=new Map(counts.map(c=>[c.stageId,c.count])),total=visible.reduce((s,x)=>s+(by.get(x.id)??0),0);
 return visible.map((s,i)=>{const reached=visible.slice(i).reduce((sum,x)=>sum+(by.get(x.id)??0),0);return {stageId:s.id,name:nameOf(s.id),leads:by.get(s.id)??0,reached,rate:total?Math.round(reached*1000/total)/10:0};});
}
