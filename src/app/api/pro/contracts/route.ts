import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {CONTRACT_BODY_MAX,contractClientMutationSchema,contractMutationSchema,contractStarterSchema,isContractClientAction} from '@/lib/pro/contracts';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin,proCustomerReader} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';
import {proHiddenDocuments} from '@/lib/pro/client-hidden';
// Row 40: contract templates, clause library, contracts per job and the linked customer's
// authenticated acceptance. Development only; nothing is sent to anyone.
const conflict='El contrato cambió. Actualice antes de continuar.';
const uuid=z.string().uuid(),work=z.string().trim().min(1).max(160);
const same=(keys:string[],expected:string[])=>keys.length===expected.length&&[...keys].sort().join()===[...expected].sort().join();
// A missing owner object (P0002) is a 404 here, like an unknown job.
const dbError=(error:{code?:string})=>error.code==='P0002'?proFail(404,'Contrato no disponible.'):proDbError(error,conflict);

export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');const keys=Object.keys(q);
  if(same(keys,['requestId'])){
   const request=uuid.safeParse(q.requestId);if(!request.success)return proFail(400,'Consulta inválida.');
   const reader=await proCustomerReader(a.db,a.user.id,request.data);
   const result=await a.db.rpc('pro_contracts_client_read',{p_actor:reader,p_request:request.data});
   if(result.error)return dbError(result.error);if(!result.data)return proFail(404,'Cita no disponible.');
   // Row 33: contracts the professional hid from the customer view (presentation only).
   const hidden=await proHiddenDocuments(a.db,reader,request.data);const body=result.data as {contracts?:{id?:string}[]};
   if(hidden.contract.size&&Array.isArray(body.contracts))body.contracts=body.contracts.filter(c=>!(typeof c.id==='string'&&hidden.contract.has(c.id)));
   return Response.json(body,{headers});
  }
  if(same(keys,['view'])||same(keys,['view','archived'])){
   if(!['library','templates'].includes(q.view)||'archived' in q&&(q.archived!=='1'||q.view!=='library'))return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_contract_library_read',{p_actor:a.user.id,p_archived:q.archived==='1'});
   if(result.error)return dbError(result.error);
   // Company › Templates preview: same {items:[{name}],nextCursor} shape as the other template lists.
   if(q.view==='templates'){const body=result.data as {templates:Array<{title:string;clauseCount:number}>;moreTemplates:boolean};return Response.json({items:body.templates.map(t=>({name:t.title,recordCount:t.clauseCount})),nextCursor:body.moreTemplates?'more':null},{headers});}
   return Response.json(result.data,{headers});
  }
  // Ronda F2-B: immutable text versions of one library clause (restoring one is a normal library_clause_update with CAS).
  if(same(keys,['clauseId'])){
   const clause=uuid.safeParse(q.clauseId);if(!clause.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_contract_library_clause_versions',{p_actor:a.user.id,p_clause:clause.data});
   if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
  }
  if(same(keys,['templateId'])){
   const template=uuid.safeParse(q.templateId);if(!template.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_contract_template_read',{p_actor:a.user.id,p_template:template.data});
   if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):proFail(404,'Plantilla no disponible.');
  }
  if(same(keys,['workId','contractId'])){
   const workId=work.safeParse(q.workId),contract=uuid.safeParse(q.contractId);if(!workId.success||!contract.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_contract_read',{p_actor:a.user.id,p_work:workId.data,p_contract:contract.data});
   if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):proFail(404,'Contrato no disponible.');
  }
  if(same(keys,['workId'])){
   const workId=work.safeParse(q.workId);if(!workId.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_contracts_read',{p_actor:a.user.id,p_work:workId.data});
   if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):proFail(404,'Trabajo no disponible.');
  }
  return proFail(400,'Consulta inválida.');
 }catch{return proFail(503,'No se pudieron cargar los contratos. Reintente.');}
}

export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'contracts-'+a.user.id,120,60000);if(limited)return limited;
  let raw:unknown;try{raw=await proBoundedJson(req,CONTRACT_BODY_MAX);}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise el contrato.');}
  if(isContractClientAction(raw)){
   const input=contractClientMutationSchema.safeParse(raw);if(!input.success)return proFail(400,'Revise su respuesta.');
   const result=await a.db.rpc('pro_contracts_client_mutate',{p_actor:a.user.id,p_input:input.data});
   if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
  }
  if(raw&&typeof raw==='object'&&(raw as {action?:unknown}).action==='starter_create'){
   const starter=contractStarterSchema.safeParse(raw);if(!starter.success)return proFail(400,'Revise el contrato.');
   const result=await a.db.rpc('pro_contract_starter_create',{p_actor:a.user.id,p_input:starter.data});
   if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
  }
  const input=contractMutationSchema.safeParse(raw);if(!input.success)return proFail(400,'Revise el contrato.');
  const result=await a.db.rpc('pro_contracts_mutate',{p_actor:a.user.id,p_input:input.data});
  if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
