import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit,enforceRateLimitKey} from '@/lib/rate-limit';
import {BID_PORTAL_BODY_MAX,BID_PORTAL_COOKIE_PATH,bidPortalCookieLink,bidPortalCookieName,bidPortalPublicSchema,bidPortalTokenSchema} from '@/lib/pro/bid-portal';
import {BidPortalConfigError,bidPortalBucket,bidPortalHash,bidPortalNewToken} from '@/lib/pro/bid-portal-server';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {z} from 'zod';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Row 53: PUBLIC vendor side of the bid portal (development only, no ContrataCR account).
// The link token is single use: claiming it opens a vendor session kept in an httpOnly cookie
// named after the link (one per invitation). The vendor reads only its own invitation and sends
// or updates its offer until the bid closes. Limits: per IP (best effort, headers can be forged)
// and per vendor session (keyed by the session cookie, not by any header).
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const fail=(status:number,reason:string,error:string)=>Response.json({error,reason},{status,headers});
const unavailable=(cause:unknown)=>cause instanceof BidPortalConfigError?fail(503,'unavailable','El portal de proveedores no está disponible en este servidor. / The vendor portal is not available on this server.'):fail(503,'unavailable','No se pudo comprobar el envío. Reintente la misma operación.');
const linkId=z.string().uuid();
/** Every valid portal session cookie of the request, by link id. */
function sessions(req:Request){
 const found=new Map<string,string>();
 for(const part of (req.headers.get('cookie')||'').split(';')){const [name,...rest]=part.trim().split('=');const link=bidPortalCookieLink(name??'');const value=rest.join('=');if(link&&bidPortalTokenSchema.safeParse(value).success)found.set(link,value);}
 return found;
}
/** The session for the named link; without a name, the only one the browser holds. */
function session(req:Request,link:string|null|undefined){
 const all=sessions(req);
 if(link)return all.get(link.toLowerCase())??null;
 return all.size===1?[...all.values()][0]!:null;
}
/** Secure whenever the request reached us over HTTPS (also behind a local HTTPS tunnel). */
function secure(req:Request){return new URL(req.url).protocol==='https:'||req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()==='https';}
function cookie(req:Request,link:string,value:string,maxAge:number){return `${bidPortalCookieName(link)}=${value}; Path=${BID_PORTAL_COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0,Math.floor(maxAge))}${secure(req)?'; Secure':''}`;}
const noStore=(limited:Response|null)=>{if(limited)for(const [k,v] of Object.entries(headers))limited.headers.set(k,v);return limited;};
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const limited=noStore(await enforceRateLimit(req,'bid-portal-view',60,60000));if(limited)return limited;
 const param=new URL(req.url).searchParams.getAll('link');if(param.length>1||param[0]!==undefined&&!linkId.safeParse(param[0]).success)return fail(400,'invalid','Consulta inválida.');
 const token=session(req,param[0]);if(!token)return fail(401,'session','Abra el enlace de invitación que recibió.');
 const perSession=noStore(await enforceRateLimitKey('bid-portal-view-session:'+bidPortalBucket(token),60,60000));if(perSession)return perSession;
 try{
  const db=createAdminClient(),hash=bidPortalHash(token,'session');
  const result=await db.rpc('pro_bid_portal_view',{p_session_hash:hash});
  if(result.error)return fail(503,'unavailable','No se pudo cargar la invitación. Reintente.');
  if(!result.data)return fail(401,'session','Esta invitación ya no está disponible. Pida un enlace nuevo.');
  // Round 4B: the vendor's own attachments and the award notice (bid-portal-files-local.sql).
  const extras=await db.rpc('pro_bid_portal_vendor_extras',{p_session_hash:hash});
  if(extras.error||!extras.data)return fail(503,'unavailable','No se pudo cargar la invitación. Reintente.');
  return Response.json({...result.data,attachments:extras.data},{headers});
 }catch(cause){return cause instanceof BidPortalConfigError?unavailable(cause):fail(503,'unavailable','No se pudo cargar la invitación. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return fail(403,'origin','Origen no autorizado.');
 const limited=noStore(await enforceRateLimit(req,'bid-portal-write',40,60000));if(limited)return limited;
 let input;try{input=bidPortalPublicSchema.parse(await proBoundedJson(req,BID_PORTAL_BODY_MAX));}catch(cause){return fail(cause instanceof RangeError?413:400,'invalid','Revise los datos enviados.');}
 try{
  const db=createAdminClient();
  if(input.action==='claim'){
   const limitedClaim=noStore(await enforceRateLimit(req,'bid-portal-claim',20,60000));if(limitedClaim)return limitedClaim;
   const next=bidPortalNewToken();
   const result=await db.rpc('pro_bid_portal_claim',{p_token_hash:bidPortalHash(input.token,'link'),p_session_hash:bidPortalHash(next,'session'),p_device_hash:input.device?bidPortalHash(input.device,'device'):null});
   if(result.error)return fail(503,'unavailable','No se pudo abrir la invitación. Reintente.');
   const data=result.data as {ok:boolean;reason?:string;link?:string;expiresAt?:string};
   if(!data.ok){
    // Reopening a used link: name it only if this browser already holds that link's session.
    const own=data.reason==='used'&&data.link&&sessions(req).has(data.link.toLowerCase())?data.link:undefined;
    return Response.json({error:'Este enlace no es válido. Pida uno nuevo a quien lo envió.',reason:data.reason||'unknown',...(own?{link:own}:{})},{status:data.reason==='used'||data.reason==='expired'||data.reason==='revoked'?410:404,headers});
   }
   return Response.json({ok:true,link:data.link},{headers:{...headers,'Set-Cookie':cookie(req,data.link!,next,(new Date(data.expiresAt!).getTime()-Date.now())/1000)}});
  }
  const token=session(req,input.link);if(!token)return fail(401,'session','Abra el enlace de invitación que recibió.');
  const perSession=noStore(await enforceRateLimitKey('bid-portal-write-session:'+bidPortalBucket(token),30,60000));if(perSession)return perSession;
  const {action:_action,link:_link,...offer}=input;void _action;void _link;
  const result=await db.rpc('pro_bid_portal_submit',{p_session_hash:bidPortalHash(token,'session'),p_input:offer});
  if(result.error){
   const code=result.error.code||'';
   if(code==='42501')return fail(401,'session','Esta invitación ya no está disponible. Pida un enlace nuevo.');
   if(code==='40001'||code==='23505')return fail(409,'changed','Su oferta cambió en otra ventana. Actualice antes de enviar de nuevo.');
   if(code==='CR429')return fail(429,'limit','Se alcanzó el máximo de envíos desde este enlace. Pida un enlace nuevo al profesional.');
   if(result.error.hint==='pro_bid_portal_closed')return fail(409,'closed','La licitación ya cerró; no se aceptan más ofertas.');
   if(['22023','22P02','23514'].includes(code))return fail(400,'invalid','Revise los precios y los datos de la oferta.');
   return fail(503,'unavailable','No se pudo comprobar el envío. Reintente la misma operación.');
  }
  return Response.json(result.data,{headers});
 }catch(cause){return unavailable(cause);}
}
