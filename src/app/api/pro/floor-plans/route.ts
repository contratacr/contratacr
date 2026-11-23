import {z} from 'zod';
import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {floorPlanContentSchema} from '@/lib/pro/floor-plan';
import {SCAN_MAX_BYTES,parseScanJson,parseScanObj,parseScanUsdzSimulated} from '@/lib/pro/room-scan';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6D (rows 64/65): 2D floor plans per job (CAS + actionId + immutable history; area/perimeter computed in
// SQL), link of room areas to Measurements, and room-scan import (JSON / OBJ parsed here, USDZ by the SIMULATED
// parser, «native» = RoomPlan JSON sent by the future Capacitor plugin). The scan file is hashed, never stored.
const id=z.string().uuid(),revision=z.number().int().min(0).max(2147483646),workId=z.string().trim().min(1).max(160),name=z.string().trim().min(1).max(120),unit=z.enum(['m','ft']);
const mutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),actionId:id,id,workId,name,unit,content:floorPlanContentSchema}).strict(),
 z.object({action:z.literal('save'),actionId:id,id,revision,name,unit,content:floorPlanContentSchema}).strict(),
 z.object({action:z.enum(['archive','restore']),actionId:id,id,revision}).strict(),
 z.object({action:z.literal('link_takeoffs'),actionId:id,id,revision,link:z.object({planId:id,measurements:z.array(z.object({roomId:z.string().max(40),measurementId:id}).strict()).max(100)}).strict()}).strict(),
 z.object({action:z.literal('import_scan'),actionId:id,id,workId,name,unit,scanId:id,fileName:z.string().trim().min(1).max(160),format:z.enum(['json','obj','usdz','native']),data:z.string().min(1).max(Math.ceil(SCAN_MAX_BYTES*4/3)+8),language:z.enum(['es','en'])}).strict(),
]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q||Object.keys(q).length!==1)return proFail(400,'Consulta inválida.');
  if(q.history){const plan=id.safeParse(q.history);if(!plan.success)return proFail(400,'Consulta inválida.');const r=await a.db.rpc('pro_floor_plan_history_read',{p_actor:a.user.id,p_plan:plan.data});if(r.error)return proDbError(r.error,'El plano cambió.');return Response.json({history:r.data},{headers});}
  const work=workId.safeParse(q.workId);if(!work.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_floor_plans_read',{p_actor:a.user.id,p_work:work.data});if(result.error)return proDbError(result.error,'Los planos cambiaron.');
  return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudieron cargar los planos. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'floor-plans-'+a.user.id,120,60000);if(limited)return limited;
  let input;try{input=mutationSchema.parse(await proBoundedJson(req,Math.ceil(SCAN_MAX_BYTES*4/3)+64*1024));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise el plano.');}
  let payload:Record<string,unknown>=input,notes:string[]=[];
  if(input.action==='import_scan'){
   const en=input.language==='en',bytes=input.format==='usdz'?new Uint8Array(Buffer.from(input.data,'base64')):new TextEncoder().encode(input.data);
   if(bytes.length>SCAN_MAX_BYTES)return proFail(413,'El archivo supera 10 MB.');
   const sha256=createHash('sha256').update(bytes).digest('hex');
   const parsed=input.format==='usdz'?parseScanUsdzSimulated(bytes,sha256,en):input.format==='obj'?parseScanObj(input.data,en):parseScanJson(input.data,en);
   if(!parsed.ok)return Response.json({error:parsed.reason==='format'?'Formato no reconocido. Use JSON de plano o RoomPlan, OBJ o USDZ.':'El archivo no tiene paredes ni ambientes que importar.',reason:parsed.reason},{status:400,headers});
   notes=parsed.notes;
   payload={action:'import_scan',actionId:input.actionId,id:input.id,workId:input.workId,name:input.name,unit:input.unit,content:parsed.content,
    scan:{id:input.scanId,format:input.format,fileName:input.fileName,sizeBytes:bytes.length,sha256,parser:input.format==='native'?'native':parsed.parser}};
  }
  const result=await a.db.rpc('pro_floor_plan_mutate',{p_actor:a.user.id,p_input:payload});
  if(result.error)return proDbError(result.error,'El plano cambió. Actualice antes de guardar.');
  return Response.json({...(result.data as object),notes},{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
