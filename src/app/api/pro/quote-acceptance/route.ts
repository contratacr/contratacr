import {z} from 'zod';
import {acceptanceEstimateReadSchema,acceptanceInputSchema,acceptancePublicationReadSchema,acceptanceReason,acceptanceResultSchema} from '@/lib/pro/quote-recorded-acceptance';
import {proAccountRateLimit,proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';
// Rows 35 and 39: the owner links a quote as the ACCEPTED AGREEMENT of a job without the customer pressing "Accept" in the platform:
// (a) the acceptance happened outside (who, when, how, evidence note) or (b) the customer's formal partial response is converted directly
// (only the approved lines). Both store a new immutable version and the agreement through the same ledger as a customer acceptance.
const conflict='La cotización o el trabajo cambió. Recargue e intente de nuevo.';
const messages:Record<string,string>={currency:'Solo las cotizaciones en colones pueden quedar como acuerdo del trabajo.',job:'Elija el trabajo.',convert_first:'Convierta primero la oportunidad en trabajo.',other_job:'Esta cotización pertenece a otro trabajo.',
 job_rules:'Este trabajo no admite el acuerdo (otro cliente, cancelado, con otro acuerdo o con finanzas anteriores).',already_converted:'Esta respuesta parcial ya se convirtió en acuerdo.',no_response:'El cliente aún no envió su respuesta parcial.',
 already_accepted:'Esta cotización ya tiene una versión aceptada.',stale:'El borrador cambió. Recargue e intente de nuevo.',client_archived:'Restaure primero al cliente.',empty:'La cotización no tiene un monto que acordar.'};
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);
  const schema=z.union([z.object({estimateId:z.string().uuid()}).strict(),z.object({publicationId:z.string().uuid()}).strict()]).safeParse(q);if(!q||!schema.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_quote_recorded_acceptance_read',{p_actor:a.user.id,p_query:schema.data});
  if(r.error)return r.error.code==='P0002'?proFail(404,'Cotización no disponible.'):proDbError(r.error,conflict);
  return Response.json('estimateId' in schema.data?acceptanceEstimateReadSchema.parse(r.data):acceptancePublicationReadSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar el acuerdo. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await proAccountRateLimit('quote-acceptance',a.user.id,30,60000);if(limited)return limited;
  let input;try{input=acceptanceInputSchema.parse(await proBoundedJson(req,4096));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos de la aceptación.');}
  const r=await a.db.rpc('pro_quote_record_acceptance',{p_actor:a.user.id,p_input:input});
  if(r.error){
   const reason=acceptanceReason((r.error as {message?:string}).message??'');
   if(reason)return Response.json({error:messages[reason]??'No se pudo registrar.',reason},{status:r.error.code==='40001'?409:400,headers});
   return proDbError(r.error,conflict);
  }
  return Response.json(acceptanceResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
