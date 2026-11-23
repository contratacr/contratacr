import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit,enforceRateLimitKey} from '@/lib/rate-limit';
import {BID_PORTAL_BODY_MAX,bidPortalQuestionAskSchema,bidPortalQuestionSchema} from '@/lib/pro/bid-portal';
import {BidPortalConfigError,bidPortalBucket,bidPortalHash,bidPortalSession} from '@/lib/pro/bid-portal-server';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';
import {z} from 'zod';

// Row 53: PUBLIC vendor side of the bid questions (no ContrataCR account). Lives under /api/pro/bid-portal so the
// vendor's httpOnly session cookie is sent. The vendor asks until the bid closes; only the owner and that vendor
// read the question and its answer. Nothing is e-mailed.
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const fail=(status:number,reason:string,error:string)=>Response.json({error,reason},{status,headers});
const noStore=(limited:Response|null)=>{if(limited)for(const [k,v] of Object.entries(headers))limited.headers.set(k,v);return limited;};
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return fail(403,'origin','Origen no autorizado.');
 const limited=noStore(await enforceRateLimit(req,'bid-portal-question-write',30,60000));if(limited)return limited;
 let input;try{input=bidPortalQuestionAskSchema.parse(await proBoundedJson(req,BID_PORTAL_BODY_MAX));}catch(cause){return fail(cause instanceof RangeError?413:400,'invalid','Escriba su pregunta en una sola línea, de hasta 1000 caracteres.');}
 const token=bidPortalSession(req,input.link);if(!token)return fail(401,'session','Abra el enlace de invitación que recibió.');
 const perSession=noStore(await enforceRateLimitKey('bid-portal-question-write-session:'+bidPortalBucket(token),10,60000));if(perSession)return perSession;
 try{
  const db=createAdminClient();
  const result=await db.rpc('pro_bid_portal_question_ask',{p_session_hash:bidPortalHash(token,'session'),p_input:{questionId:input.questionId,text:input.text}});
  if(result.error){
   const code=result.error.code||'';
   if(code==='42501')return fail(401,'session','Esta invitación ya no está disponible. Pida un enlace nuevo.');
   if(result.error.hint==='pro_bid_portal_closed')return fail(409,'closed','La licitación ya cerró; no se aceptan más preguntas.');
   if(code==='CR429')return fail(429,'limit','Se alcanzó el máximo de preguntas de esta invitación.');
   if(['22023','22P02','23514','23505'].includes(code))return fail(400,'invalid','Revise su pregunta.');
   return fail(503,'unavailable','No se pudo enviar la pregunta. Reintente.');
  }
  const parsed=z.object({question:bidPortalQuestionSchema}).strict().safeParse(result.data);
  if(!parsed.success)return fail(503,'unavailable','No se pudo enviar la pregunta. Reintente.');
  return Response.json(parsed.data,{headers});
 }catch(cause){return cause instanceof BidPortalConfigError?fail(503,'unavailable','El portal de proveedores no está disponible en este servidor.'):fail(503,'unavailable','No se pudo enviar la pregunta. Reintente.');}
}
