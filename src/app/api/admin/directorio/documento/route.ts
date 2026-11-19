import {getApiAdmin} from '@/lib/auth/admin';
import {createAdminClient} from '@/lib/supabase/admin';
import {dirFail} from '@/lib/directory/public-route';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// LOCAL PRO ONLY (multivertical M1, development only): opens one private claim document for the staff queue.
// GET ?path=dir-claims/<claimId>/<file>. Administrators with verified MFA only; the path must be a registered upload
// (dir_claim_uploads). Served inline from the private bucket with no caching and no sniffing.
const PATH=/^dir-claims\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100}$/;
export async function GET(req:Request){
 if(!DIR_ENABLED)return new Response(null,{status:404});
 const admin=await getApiAdmin();if(!admin)return dirFail(403,'forbidden','Se requiere acceso administrativo verificado.');
 const path=new URL(req.url).searchParams.get('path')??'';if(!PATH.test(path))return dirFail(400,'invalid');
 const db=createAdminClient();
 const row=await db.from('dir_claim_uploads').select('mime').eq('path',path).maybeSingle();
 if(row.error)return dirFail(503,'unavailable');if(!row.data)return dirFail(404,'not_found');
 const file=await db.storage.from('dir-claim-documents').download(path);
 if(file.error||!file.data)return dirFail(404,'not_found');
 return new Response(file.data,{headers:{'Content-Type':row.data.mime as string,'Content-Disposition':'inline','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",'Referrer-Policy':'no-referrer'}});
}
