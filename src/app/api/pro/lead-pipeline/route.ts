import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {excelCsv} from '@/lib/pro/round10';
import {leadStageHistorySchema,pipelineForecastSchema,stageFunnelSchema,stageSettingsInputSchema,stageSettingsResultSchema,stageSettingsSchema} from '@/lib/pro/sales-pipeline';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Ronda F2-B (rows 07, 08): stage colour and win probability, weighted forecast, time in stage per lead and
 * the funnel by stage reached (JSON or CSV for Excel). Stage creation/rename/reorder/hide keeps using the
 * existing request-pipeline writers. Role gate: writes = lead.write (prefix lead-).
 */
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const query=z.discriminatedUnion('view',[
 z.object({view:z.literal('settings')}).strict(),
 z.object({view:z.literal('forecast')}).strict(),
 z.object({view:z.literal('lead'),kind:z.enum(['manual','request']),id:z.string().uuid()}).strict(),
 z.object({view:z.literal('funnel'),from:day,to:day,channel:z.string().min(1).max(40).optional(),format:z.literal('csv').optional(),lang:z.enum(['es','en']).optional(),
  names:z.string().max(4000).optional()}).strict(),
]);
const csvHead={es:['Etapa','Llegaron','% desde el inicio','% desde la etapa anterior','Ahora en la etapa','Tiempo promedio (días)','Tiempo mediano (días)'],
 en:['Stage','Reached','% from start','% from previous stage','Currently in stage','Average time (days)','Median time (days)']};
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),parsed=raw?query.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Consulta inválida.');
  const q=parsed.data;
  const p_query=q.view==='funnel'?{view:'funnel',from:q.from,to:q.to,channel:q.channel??null}:q.view==='lead'?{view:'lead',kind:q.kind,id:q.id}:{view:q.view};
  const r=await a.db.rpc('pro_lead_pipeline_read',{p_owner:a.user.id,p_query});if(r.error)return proDbError(r.error,'Las solicitudes cambiaron.');
  if(q.view==='settings')return Response.json(stageSettingsSchema.parse(r.data),{headers});
  if(q.view==='forecast')return Response.json(pipelineForecastSchema.parse(r.data),{headers});
  if(q.view==='lead')return Response.json(leadStageHistorySchema.parse(r.data),{headers});
  const report=stageFunnelSchema.parse(r.data);
  if(q.format!=='csv')return Response.json(report,{headers});
  const lang=q.lang??'es';let names:Record<string,string>={};try{names=z.record(z.string().max(80),z.string().max(80)).parse(JSON.parse(q.names??'{}'));}catch{return proFail(400,'Consulta inválida.');}
  const num=(v:number|null,dec=1)=>v===null?'':new Intl.NumberFormat(lang==='en'?'en-US':'es-CR',{maximumFractionDigits:dec,useGrouping:false}).format(v);
  const csv=excelCsv(csvHead[lang],report.stages.map(s=>[names[s.stageId]??s.stageId,s.reached,num(s.fromStart),num(s.fromPrevious),s.current,num(s.avgHours===null?null:s.avgHours/24),num(s.medianHours===null?null:s.medianHours/24)]));
  return new Response(csv,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="funnel-${report.from}-${report.to}.csv"`}});
 }catch{return proFail(503,'No se pudieron cargar las solicitudes.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'lead-pipeline-'+a.user.id,120,60000);if(limited)return limited;
  let input;try{input=stageSettingsInputSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise los datos de la etapa.');}
  const member=await proWorkspaceMember();const r=await a.db.rpc('pro_lead_stage_style_mutate',{p_owner:a.user.id,p_input:input,p_member:member?.memberId??null});
  if(r.error)return proDbError(r.error,'Las etapas cambiaron en otra pestaña. Recargue.');
  return Response.json(stageSettingsResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente: no se duplicará.');}
}
