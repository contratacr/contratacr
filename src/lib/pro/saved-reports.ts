import {z} from 'zod';
/** Area E: saved custom reports. A saved report stores only the filter (report type + period), never financial data. */
export const reportKeys=['financial','customers','payments','vat','payables','cashflow','income','jobs','timeMember','timeProject','selections'] as const;
export const reportRanges=['all','fixed','this_month','last_month','this_year','last_30','last_90'] as const;
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v);
const id=z.string().uuid();
export const savedReportSchema=z.object({id,name:z.string().min(1).max(80),report:z.enum(reportKeys),range:z.enum(reportRanges),from:day.nullable(),to:day.nullable()}).strict();
export const savedReportsSchema=z.object({reports:z.array(savedReportSchema).max(30)}).strict();
export type SavedReport=z.infer<typeof savedReportSchema>;
export const savedReportMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),id,name:z.string().trim().min(1).max(80),report:z.enum(reportKeys),range:z.enum(reportRanges),from:day.nullable(),to:day.nullable()}).strict()
  .refine(v=>(v.range==='fixed')===(v.from!==null||v.to!==null)&&(!v.from||!v.to||v.from<=v.to)),
 z.object({action:z.literal('delete'),id}).strict(),
]);
const iso=(d:Date)=>d.toISOString().slice(0,10);
/** Concrete dates for a saved range, relative to «today» (a yyyy-mm-dd string). */
export function resolveReportRange(range:SavedReport['range'],today:string,from:string|null,to:string|null):{from:string;to:string}{
 const d=new Date(today+'T12:00:00Z'),y=d.getUTCFullYear(),m=d.getUTCMonth();
 switch(range){
  case 'this_month':return {from:iso(new Date(Date.UTC(y,m,1,12))),to:iso(new Date(Date.UTC(y,m+1,0,12)))};
  case 'last_month':return {from:iso(new Date(Date.UTC(y,m-1,1,12))),to:iso(new Date(Date.UTC(y,m,0,12)))};
  case 'this_year':return {from:`${y}-01-01`,to:`${y}-12-31`};
  case 'last_30':return {from:iso(new Date(d.getTime()-29*864e5)),to:today};
  case 'last_90':return {from:iso(new Date(d.getTime()-89*864e5)),to:today};
  case 'fixed':return {from:from??'',to:to??''};
  default:return {from:'',to:''};
 }
}
