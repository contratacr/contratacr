import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {savedListMutationSchema} from '@/lib/directory/place-features';
import {dirDbError,dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';

// LOCAL PRO ONLY (place features round, development only): saved lists of the signed-in person.
//  GET  [?slug=<place>] → dir_saved_lists_mine (lists + places; hasPlace for that place).
//  POST savedListMutationSchema → dir_saved_list_mutate (CAS revision → 409 reload; idempotent actionId).
// Lists are private; the share link (/lista/<token>) exposes only the list name and its public places.
export async function GET(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 const limited=await enforceRateLimit(req,'dir-lists-read',60,60_000);if(limited)return limited;
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login','Inicie sesión.');
 const slug=new URL(req.url).searchParams.get('slug');if(slug&&!placeSlugSchema.safeParse(slug).success)return dirFail(400,'invalid');
 const r=await createAdminClient().rpc('dir_saved_lists_mine',{p_actor:user.id,p_slug:slug});
 return r.error?dirDbError(r.error):dirOk({items:r.data});
}
export async function POST(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-lists',30,60_000);if(limited)return limited;
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login','Inicie sesión.');
 let raw:unknown;try{raw=await proBoundedJson(req,2048);}catch{return dirFail(400,'invalid');}
 const body=savedListMutationSchema.safeParse(raw);if(!body.success)return dirFail(400,'invalid');
 const r=await createAdminClient().rpc('dir_saved_list_mutate',{p_actor:user.id,p_input:JSON.parse(JSON.stringify(body.data))});
 return r.error?dirDbError(r.error):dirOk(r.data);
}
