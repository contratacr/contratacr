import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimitKey} from '@/lib/rate-limit';
import {validateUpload,MIME_FOR} from '@/lib/upload-validation';
import {getConnection,igFail,instagramAdapterOrNull} from '@/lib/integrations/instagram/server';
import {MEDIA_ID_RE,importablePhotos} from '@/lib/integrations/instagram/types';

// GET /api/integrations/instagram/media/<id> → the bytes of one photo of the CONNECTED account (looked up again in its own
// media list, never a URL from the browser), checked by magic bytes (JPEG/PNG/WebP). Used for the grid thumbnails and, for a
// place, as the source the browser turns into the 1600/800/320 variants (storage plan 2026-11-26) before /import validates them.
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const adapter=instagramAdapterOrNull();if(!adapter)return new Response(null,{status:404});
 const {id}=await params;if(!MEDIA_ID_RE.test(id))return igFail(404,'not_found');
 const user=await safeGetUser(await createClient());if(!user)return igFail(401,'login');
 const limited=await enforceRateLimitKey(`ig-media-file:${user.id}`,240,600_000);if(limited)return limited;
 try{
  const c=await getConnection(createAdminClient(),user.id,adapter);if(!c)return igFail(409,'not_connected');
  const m=importablePhotos(await adapter.listMedia(c.accessToken)).find(x=>x.id===id);if(!m)return igFail(404,'not_found');
  const f=await adapter.fetchMedia(c.accessToken,m);
  const check=validateUpload(Buffer.from(f.bytes),{allow:['jpeg','png','webp'],maxBytes:8*1024*1024,allowLabel:'JPG, PNG o WEBP'});
  if(!check.ok)return igFail(415,'photo_format');
  return new Response(f.bytes as Uint8Array<ArrayBuffer>,{headers:{'Content-Type':MIME_FOR[check.kind],'Cache-Control':'private, max-age=600','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Referrer-Policy':'no-referrer'}});
 }catch{return igFail(503,'unavailable');}
}
