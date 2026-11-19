import {z} from 'zod';
import {proActor,proDbError,proFail,proQuery,proRouteHeaders} from '@/lib/pro/route-common';

// Round 12: «Primeros pasos» of Pro (read only, derived from the account's own records; nothing stored or sent).
const schema=z.object({steps:z.array(z.object({key:z.enum(['profile','branding','customer','quote','job','client_linked','client_view','billing','team']),done:z.boolean()}).strict()).max(20),done:z.number().int().min(0),total:z.number().int().min(0)}).strict();
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q||Object.keys(q).length)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_getting_started_read',{p_actor:a.user.id});
  if(result.error)return proDbError(result.error,'Los datos cambiaron. Actualice.');
  return Response.json(schema.parse(result.data),{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo cargar la guía de primeros pasos.');}
}
