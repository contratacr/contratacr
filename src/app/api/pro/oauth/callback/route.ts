import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proRequestOrigin} from '@/lib/pro/route-common';
import {finishConnection,OAuthError} from '@/lib/pro/integrations/oauth/service';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6B: OAuth 2.0 redirect URI for Google, Microsoft and Intuit (and their local mock). The state is
// single-use, expires in 10 minutes and must belong to the signed-in owner; the code is exchanged with the
// PKCE verifier. The browser is then sent back to the screen that started the connection.
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const page=(text:string,status:number)=>new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conexión</title></head><body style="font:16px system-ui;margin:24px"><p data-oauth-error>${text}</p><p><a href="/es/dashboard/pro?tab=pro_company&amp;empresa=conectores">Volver a ContrataCR Pro</a></p></body></html>`,{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const limited=await enforceRateLimit(req,'oauth-callback',60,60000);if(limited)return limited;
 const url=new URL(req.url),q=(name:string)=>{const all=url.searchParams.getAll(name);return all.length===1?all[0]!.slice(0,4096):undefined;};
 try{
  const user=await safeGetUser(await createClient());
  const target=await finishConnection(createAdminClient(),user?.id??null,{state:q('state'),code:q('code'),error:q('error'),realmId:q('realmId')},proRequestOrigin(req));
  return new Response(null,{status:303,headers:{...headers,Location:target}});
 }catch(error){
  if(error instanceof OAuthError)return page(error.reason==='pro_oauth_owner'?'Esta conexión fue iniciada por otra cuenta. Inicie sesión con la cuenta correcta y vuelva a conectar.':'El enlace de conexión no es válido, ya se usó o venció. Vuelva a conectar desde ContrataCR Pro.',error.status===403?403:400);
  return page('No se pudo completar la conexión. Reintente.',503);
 }
}
