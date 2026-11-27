import {cookies} from 'next/headers';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {IG_STATE_COOKIE,igHeaders,instagramAdapterOrNull,saveConnection} from '@/lib/integrations/instagram/server';
import {instagramErrorCode,safeReturnPath} from '@/lib/integrations/instagram/types';

// GET /api/integrations/instagram/callback?code&state (or error=access_denied) → checks the state cookie of /connect (same
// person, same value), exchanges the code for a long-lived token, stores it server-side (instagram_connections) and sends the
// person back with ?instagram=conectado|cancelado|error. The token never reaches the browser.
export async function GET(req:Request){
 const adapter=instagramAdapterOrNull();if(!adapter)return new Response(null,{status:404,headers:igHeaders});
 const url=new URL(req.url),jar=await cookies(),raw=jar.get(IG_STATE_COOKIE)?.value;
 jar.delete({name:IG_STATE_COOKIE,path:'/api/integrations/instagram'});
 let saved:{state?:string;back?:string;user?:string}={};try{saved=raw?JSON.parse(raw):{};}catch{}
 const back=safeReturnPath(saved.back,'/integraciones/instagram/listo');
 const go=(result:string)=>{const to=new URL(back,url);to.searchParams.set('instagram',result);return new Response(null,{status:303,headers:{...igHeaders,Location:to.toString()}});};
 const user=await safeGetUser(await createClient());
 if(!user||!saved.state||saved.user!==user.id||url.searchParams.get('state')!==saved.state)return go('error');
 if(url.searchParams.get('error'))return go('cancelado');
 const code=url.searchParams.get('code');if(!code||code.length>2048)return go('error');
 try{
  const token=await adapter.exchangeCode(code);
  await saveConnection(createAdminClient(),user.id,adapter.provider,token);
  return go('conectado');
 }catch(e){console.error('[instagram] callback',instagramErrorCode(e));return go('error');}
}
