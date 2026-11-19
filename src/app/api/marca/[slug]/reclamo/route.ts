import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {brandClaimSchema} from '@/lib/directory/place-features';
import {dirDbError,dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';

// LOCAL PRO ONLY (place features round, development only): claim a brand (chain) → dir_brand_claim_open. Always
// staff-reviewed with documents the same person uploaded for this claim id (/api/marca/<slug>/reclamo/documentos);
// decided in /admin/directorio (tab «Marcas»), never by the claimant. Free; it never changes order or visibility.
export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-brand-claim',6,60_000);if(limited)return limited;
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login','Inicie sesión para reclamar la marca.');
 let raw:unknown;try{raw=await proBoundedJson(req,4096);}catch{return dirFail(400,'invalid');}
 const body=brandClaimSchema.safeParse(raw);if(!body.success)return dirFail(400,'invalid');
 const r=await createAdminClient().rpc('dir_brand_claim_open',{p_actor:user.id,p_input:JSON.parse(JSON.stringify({...body.data,brandSlug:slug}))});
 return r.error?dirDbError(r.error):dirOk(r.data);
}
