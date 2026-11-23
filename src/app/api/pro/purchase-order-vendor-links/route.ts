import {enforceRateLimit} from '@/lib/rate-limit';
import {PO_PORTAL_BODY_MAX,poVendorOwnerMutationSchema,poVendorOwnerQuerySchema} from '@/lib/pro/po-portal';
import {BidPortalConfigError,bidPortalHash,bidPortalNewToken} from '@/lib/pro/bid-portal-server';
import {proActor,proBoundedJson,proDbError,proFail,proInternalFinanceDenied,proQuery,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Family 51: owner side of the purchase order vendor link. The owner copies the link; nothing is e-mailed. The token is random, returned once and only its keyed
// hash is stored. A retried create (same actionId) replays the receipt WITHOUT a token: the owner replaces the link to get a new one.
const conflict='El enlace cambió. Actualice antes de continuar.';
const notConfigured=()=>Response.json({error:'El enlace de proveedor no está configurado en este servidor (falta PRO_BID_PORTAL_SECRET). No se creó ningún enlace.',reason:'config'},{status:503,headers:proRouteHeaders});
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const denied=await proInternalFinanceDenied();if(denied)return denied;
  const raw=proQuery(req);const parsed=raw?poVendorOwnerQuerySchema.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_po_vendor_owner_read',{p_actor:a.user.id,p_query:parsed.data});
  if(result.error)return proDbError(result.error,conflict);
  return result.data?Response.json(result.data,{headers:proRouteHeaders}):proFail(404,'Orden no disponible.');
 }catch{return proFail(503,'No se pudo cargar el enlace. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const denied=await proInternalFinanceDenied();if(denied)return denied;
  const limited=await enforceRateLimit(req,'po-vendor-links-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=poVendorOwnerMutationSchema.parse(await proBoundedJson(req,PO_PORTAL_BODY_MAX));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos del enlace.');}
  let token:string|null=null,tokenHash:string|null=null;
  if(input.action==='create_link'){try{token=bidPortalNewToken();tokenHash=bidPortalHash(token,'po-link');}catch(cause){if(cause instanceof BidPortalConfigError)return notConfigured();throw cause;}}
  const result=await a.db.rpc('pro_po_vendor_owner_mutate',{p_actor:a.user.id,p_input:tokenHash?{...input,tokenHash}:input});
  if(result.error)return proDbError(result.error,conflict);
  const data=result.data as {replayed?:boolean};
  return Response.json(token&&!data?.replayed?{...result.data,token}:result.data,{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo comprobar el enlace. Reintente la misma operación.');}
}
