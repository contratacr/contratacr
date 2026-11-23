import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proSameOrigin,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {trainingLessons} from '@/lib/pro/help-content';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Row 74: lesson progress of the account (a lesson is marked or unmarked by the person; nothing is inferred). */
const keys=trainingLessons.map(l=>l.key) as [string,...string[]];
const body=z.object({lessonKey:z.enum(keys),completed:z.boolean()}).strict();
const result=z.object({completed:z.array(z.object({key:z.string(),at:z.string()}).strict()).max(100)}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q||Object.keys(q).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_training_read',{p_actor:a.user.id});if(r.error)return proDbError(r.error,'Los datos cambiaron.');
  return Response.json(result.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar la formación.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'company-training-'+a.user.id,60,60000);if(limited)return limited;
 let input;try{input=body.parse(await proBoundedJson(req,1024));}catch{return proFail(400,'Revise los datos.');}
 try{
  const r=await a.db.rpc('pro_training_set',{p_actor:a.user.id,p_input:input});if(r.error)return proDbError(r.error,'Los datos cambiaron.');
  return Response.json(result.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo guardar el avance.');}
}
