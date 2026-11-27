import {cookies} from 'next/headers';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimitKey} from '@/lib/rate-limit';
import {IG_STATE_COOKIE,igHeaders,instagramAdapterOrNull} from '@/lib/integrations/instagram/server';
import {safeReturnPath} from '@/lib/integrations/instagram/types';

// GET /api/integrations/instagram/connect?return=<in-app path> → the adapter's authorize page (Meta, or the local sandbox
// screen). A random state goes in an httpOnly cookie (10 min) together with the validated return path; the callback checks it.
export async function GET(req:Request){
 const adapter=instagramAdapterOrNull();if(!adapter)return new Response(null,{status:404,headers:igHeaders});
 const url=new URL(req.url),back=safeReturnPath(url.searchParams.get('return'),'/integraciones/instagram/listo');
 const user=await safeGetUser(await createClient());
 if(!user)return Response.redirect(new URL('/login?redirect='+encodeURIComponent(url.pathname+url.search),url),303);
 const limited=await enforceRateLimitKey(`ig-connect:${user.id}`,20,3_600_000);if(limited)return limited;
 const state=crypto.randomUUID();
 (await cookies()).set(IG_STATE_COOKIE,JSON.stringify({state,back,user:user.id}),{httpOnly:true,sameSite:'lax',secure:url.protocol==='https:',path:'/api/integrations/instagram',maxAge:600});
 return new Response(null,{status:303,headers:{...igHeaders,Location:new URL(adapter.authorizeUrl(state),url).toString()}});
}
