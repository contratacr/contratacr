import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimitKey} from '@/lib/rate-limit';
import {getConnection,igFail,igHeaders,instagramAdapterOrNull,liveImportedMediaIds} from '@/lib/integrations/instagram/server';
import {resolveImportTarget} from '@/lib/integrations/instagram/target';
import {importablePhotos,instagramErrorCode} from '@/lib/integrations/instagram/types';

// GET ?target=place&slug=<slug> | ?target=portfolio → the connected account's recent PHOTOS (IMAGE and carousel cover; no
// videos), each with `imported` when it is already on that place/profile. No media_url is sent: the grid loads the
// thumbnails through /api/integrations/instagram/media/<id> (same origin, the token stays on the server).
export async function GET(req:Request){
 const adapter=instagramAdapterOrNull();if(!adapter)return new Response(null,{status:404,headers:igHeaders});
 const user=await safeGetUser(await createClient());if(!user)return igFail(401,'login');
 const limited=await enforceRateLimitKey(`ig-media:${user.id}`,60,600_000);if(limited)return limited;
 const url=new URL(req.url),db=createAdminClient();
 try{
  const target=await resolveImportTarget(db,user.id,url.searchParams.get('target'),url.searchParams.get('slug'));
  if('error' in target)return igFail(target.error,target.reason);
  const c=await getConnection(db,user.id,adapter);if(!c)return igFail(409,'not_connected','Conecte su cuenta de Instagram.');
  const [list,done]=await Promise.all([adapter.listMedia(c.accessToken),liveImportedMediaIds(db,user.id,target.target)]);
  const items=importablePhotos(list).map(m=>({id:m.id,type:m.type,permalink:m.permalink,timestamp:m.timestamp,imported:done.has(m.id)}));
  return Response.json({username:c.username,items},{headers:igHeaders});
 }catch(e){const code=instagramErrorCode(e);return code==='token'?igFail(409,'not_connected','Vuelva a conectar su cuenta de Instagram.'):igFail(503,'unavailable');}
}
