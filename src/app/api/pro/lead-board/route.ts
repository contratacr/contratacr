import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {builtinChannelLabel,conversionReportSchema,excelCsv,leadBoardInputSchema,leadBoardSchema} from '@/lib/pro/round10';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 10 (rows 07, 08): pipeline board (Kanban) over the existing lead sources, moving cards through
 * the existing stage writers, won/lost outcome with reason, and conversion by channel or campaign for a
 * Costa Rica period (JSON or CSV for Excel). Role gate: writes = lead.write.
 */
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const query=z.discriminatedUnion('view',[
 z.object({view:z.literal('board'),q:z.string().max(100).optional(),channel:z.string().max(40).optional(),hideLost:z.enum(['0','1']).optional()}).strict(),
 z.object({view:z.literal('conversion'),from:day,to:day,group:z.enum(['channel','campaign','member']),format:z.literal('csv').optional(),lang:z.enum(['es','en']).optional()}).strict(),
]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),parsed=raw?query.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Consulta inválida.');
  if(parsed.data.view==='board'){const r=await a.db.rpc('pro_lead_board_read',{p_owner:a.user.id,p_query:parsed.data.q??'',p_channel:parsed.data.channel||null,p_hide_lost:parsed.data.hideLost==='1'});if(r.error)return proDbError(r.error,'Las solicitudes cambiaron.');return Response.json(leadBoardSchema.parse(r.data),{headers});}
  const r=parsed.data.group==='member'?await a.db.rpc('pro_lead_team_conversion_report',{p_owner:a.user.id,p_from:parsed.data.from,p_to:parsed.data.to}):await a.db.rpc('pro_lead_conversion_report',{p_owner:a.user.id,p_from:parsed.data.from,p_to:parsed.data.to,p_group:parsed.data.group});if(r.error)return proDbError(r.error,'Las solicitudes cambiaron.');
  const report=conversionReportSchema.parse(r.data);
  if(parsed.data.format==='csv'){const en=parsed.data.lang==='en';
   const head=en?[report.group==='channel'?'Channel':report.group==='member'?'Team member':'Campaign','Received','Reached meeting','Reached quote','Won','Lost','Converted to job','Conversion %']:[report.group==='channel'?'Canal':report.group==='member'?'Responsable':'Campaña','Recibidas','Llegaron a reunión','Llegaron a cotización','Ganadas','Perdidas','Convertidas en trabajo','Conversión %'];
   const label=(k:string,n:string|null)=>n??(k==='unspecified'?(en?'No channel':'Sin canal'):k==='none'?(en?'No campaign':'Sin campaña'):k==='unassigned'?(en?'Unassigned':'Sin responsable'):builtinChannelLabel(k,en)??k);
   const csv=excelCsv(head,[...report.rows.map(x=>[label(x.key,x.name),x.received,x.meeting,x.estimate,x.won,x.lost,x.converted,x.conversionRate===null?'':String(x.conversionRate).replace('.',en?'.':',')]),[en?'Total':'Total',report.totals.received,report.totals.meeting,report.totals.estimate,report.totals.won,report.totals.lost,report.totals.converted,'']]);
   return new Response(csv,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="conversion-${report.from}-${report.to}.csv"`}});}
  return Response.json(report,{headers});
 }catch{return proFail(503,'No se pudieron cargar las solicitudes.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'lead-board-'+a.user.id,120,60000);if(limited)return limited;
  let input;try{input=leadBoardInputSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise los datos de la solicitud.');}
  // Fix 13: the outcome history names the company member who acted, not the owner.
  const member=await proWorkspaceMember();const r=await a.db.rpc('pro_lead_board_mutate',{p_owner:a.user.id,p_input:input,p_member:member?.memberId??null});
  if(r.error)return proDbError(r.error,'La solicitud cambió en otra pestaña. Recargue el tablero.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente: no se duplicará.');}
}
