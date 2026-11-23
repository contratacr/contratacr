import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit,enforceRateLimitKey} from '@/lib/rate-limit';
import {PO_PORTAL_BODY_MAX,PO_PORTAL_COOKIE_PATH,poPortalCookieName,poVendorPublicSchema} from '@/lib/pro/po-portal';
import {poPortalSession,poPortalSessions} from '@/lib/pro/po-portal-server';
import {BidPortalConfigError,bidPortalBucket,bidPortalHash,bidPortalNewToken} from '@/lib/pro/bid-portal-server';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {z} from 'zod';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Family 51: PUBLIC vendor side of a purchase order link (no ContrataCR account). The single-use link token is exchanged for an httpOnly
// session cookie named after the link. The vendor reads only its own order and confirms, declines or proposes a delivery date.
// Limits per IP (best effort) and per vendor session (keyed by the session cookie).
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const fail=(status:number,reason:string,error:string)=>Response.json({error,reason},{status,headers});
const linkId=z.string().uuid();
const secure=(req:Request)=>new URL(req.url).protocol==='https:'||req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()==='https';
const cookie=(req:Request,link:string,value:string,maxAge:number)=>`${poPortalCookieName(link)}=${value}; Path=${PO_PORTAL_COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0,Math.floor(maxAge))}${secure(req)?'; Secure':''}`;
const noStore=(limited:Response|null)=>{if(limited)for(const [k,v] of Object.entries(headers))limited.headers.set(k,v);return limited;};
const unavailable=(cause:unknown)=>cause instanceof BidPortalConfigError?fail(503,'unavailable','El enlace de proveedor no está disponible en este servidor.'):fail(503,'unavailable','No se pudo completar la operación. Reintente.');
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const limited=noStore(await enforceRateLimit(req,'po-portal-view',60,60000));if(limited)return limited;
 const param=new URL(req.url).searchParams.getAll('link');if(param.length>1||param[0]!==undefined&&!linkId.safeParse(param[0]).success)return fail(400,'invalid','Consulta inválida.');
 const token=poPortalSession(req,param[0]);if(!token)return fail(401,'session','Abra el enlace que recibió.');
 const perSession=noStore(await enforceRateLimitKey('po-portal-view-session:'+bidPortalBucket(token),60,60000));if(perSession)return perSession;
 try{
  const result=await createAdminClient().rpc('pro_po_vendor_view',{p_session_hash:bidPortalHash(token,'po-session')});
  if(result.error)return fail(503,'unavailable','No se pudo cargar la orden. Reintente.');
  if(!result.data)return fail(401,'session','Este enlace ya no está disponible. Pida uno nuevo.');
  return Response.json(result.data,{headers});
 }catch(cause){return unavailable(cause);}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return fail(403,'origin','Origen no autorizado.');
 const limited=noStore(await enforceRateLimit(req,'po-portal-write',40,60000));if(limited)return limited;
 let input;try{input=poVendorPublicSchema.parse(await proBoundedJson(req,PO_PORTAL_BODY_MAX));}catch(cause){return fail(cause instanceof RangeError?413:400,'invalid','Revise los datos enviados.');}
 try{
  const db=createAdminClient();
  if(input.action==='claim'){
   const limitedClaim=noStore(await enforceRateLimit(req,'po-portal-claim',20,60000));if(limitedClaim)return limitedClaim;
   const next=bidPortalNewToken();
   const result=await db.rpc('pro_po_vendor_claim',{p_token_hash:bidPortalHash(input.token,'po-link'),p_session_hash:bidPortalHash(next,'po-session'),p_device_hash:input.device?bidPortalHash(input.device,'po-device'):null});
   if(result.error)return fail(503,'unavailable','No se pudo abrir el enlace. Reintente.');
   const data=result.data as {ok:boolean;reason?:string;link?:string;expiresAt?:string};
   if(!data.ok){
    const own=data.reason==='used'&&data.link&&poPortalSessions(req).has(data.link.toLowerCase())?data.link:undefined;
    return Response.json({error:'Este enlace no es válido. Pida uno nuevo a quien lo envió.',reason:data.reason||'unknown',...(own?{link:own}:{})},{status:data.reason==='used'||data.reason==='expired'||data.reason==='revoked'?410:404,headers});
   }
   return Response.json({ok:true,link:data.link},{headers:{...headers,'Set-Cookie':cookie(req,data.link!,next,(new Date(data.expiresAt!).getTime()-Date.now())/1000)}});
  }
  const token=poPortalSession(req,input.link);if(!token)return fail(401,'session','Abra el enlace que recibió.');
  const perSession=noStore(await enforceRateLimitKey('po-portal-write-session:'+bidPortalBucket(token),20,60000));if(perSession)return perSession;
  const result=await db.rpc('pro_po_vendor_respond',{p_session_hash:bidPortalHash(token,'po-session'),p_input:{actionId:input.actionId,revision:input.revision,response:input.response,proposedDate:input.proposedDate,note:input.note}});
  if(result.error){
   const code=result.error.code||'';
   if(code==='42501')return fail(401,'session','Este enlace ya no está disponible. Pida uno nuevo.');
   if(code==='40001')return fail(409,'changed','La orden cambió. Actualice antes de responder.');
   if(code==='CR429')return fail(429,'limit','Se alcanzó el máximo de respuestas de este enlace. Pida un enlace nuevo.');
   if(result.error.hint==='pro_po_closed')return fail(409,'closed','La orden ya no acepta respuestas.');
   if(['22023','22P02','23514','23505'].includes(code))return fail(400,'invalid','Revise la respuesta.');
   return fail(503,'unavailable','No se pudo comprobar el envío. Reintente la misma operación.');
  }
  return Response.json(result.data,{headers});
 }catch(cause){return unavailable(cause);}
}
