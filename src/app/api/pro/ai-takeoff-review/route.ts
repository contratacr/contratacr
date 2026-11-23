import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {takeoffReviewSchema} from '@/lib/pro/takeoff-review';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Row 67: persisted human review of an AI plan reading. After the owner keeps (and maybe edits) rows, the client
// records who accepted what and the proposed vs saved values. One immutable record per AI suggestion. This route
// never creates measurements: those go through the existing takeoffs writer.
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'ai-takeoff-review-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=takeoffReviewSchema.parse(await proBoundedJson(req,32768));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise la solicitud.');}
  const result=await a.db.rpc('pro_ai_takeoff_review_record',{p_actor:a.user.id,p_input:input});
  if(result.error)return proDbError(result.error,'No se pudo registrar la revisión.');
  return Response.json(z.record(z.string(),z.unknown()).parse(result.data),{headers});
 }catch{return proFail(503,'No se pudo registrar la revisión. Reintente.');}
}
