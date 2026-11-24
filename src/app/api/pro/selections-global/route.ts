import {proAccountRateLimit,proActor,proDbError,proFail,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {globalTrackerSchema} from '@/lib/pro/selection-boards';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area E: global selections tracker, every item of every job of the owner (read only, at most 1000 rows). */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await proAccountRateLimit('selections-global',a.user.id,30,60000);if(limited)return limited;
  const r=await a.db.rpc('pro_selections_global_read',{p_owner:a.user.id});if(r.error)return proDbError(r.error,'Las selecciones cambiaron.');
  return Response.json(globalTrackerSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar el seguimiento global.');}
}
