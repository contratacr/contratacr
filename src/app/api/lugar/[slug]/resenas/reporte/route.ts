import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {reviewFlagSchema} from '@/lib/directory/moderation-schemas';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {dirDbError,dirDeviceId,dirEnabledOnly,dirFail,dirOk,dirPepper,hmacHex} from '@/lib/directory/public-route';

// LOCAL PRO ONLY (multivertical M1, development only): «Reportar reseña» → dir_review_flag_create. Signed in: the
// person; without an account: the device (httpOnly cookie, only its server HMAC reaches the database). One report per
// person/device per review (a repeat answers ok), 20 a day; the review stays public until staff decide in the queue.
export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-review-flag',10,60_000);if(limited)return limited;
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 let raw:unknown;try{raw=await proBoundedJson(req,2048);}catch{return dirFail(400,'invalid');}
 const body=reviewFlagSchema.safeParse(raw);if(!body.success)return dirFail(400,body.error.issues[0]?.path[0]==='message'?'message_required':'invalid');
 const db=createAdminClient();
 // The review must belong to this place (the SQL also checks that both are public).
 const owner=await db.from('dir_reviews').select('dir_places!inner(slug)').eq('id',body.data.reviewId).maybeSingle();
 if(owner.error)return dirFail(503,'unavailable');
 if(!owner.data||(owner.data.dir_places as unknown as {slug:string}).slug!==slug)return dirFail(404,'not_found');
 const user=await safeGetUser(await createClient());
 let visitorHash:string|undefined;
 if(!user){const pepper=dirPepper('DIR_VISITOR_PEPPER');if(!pepper)return dirFail(503,'unavailable');visitorHash=await hmacHex(pepper,'device:'+await dirDeviceId(true));}
 const input={...body.data,...(body.data.message?{}:{message:undefined}),...(visitorHash?{visitorHash}:{})};
 const result=await db.rpc('dir_review_flag_create',{p_actor:user?.id??null,p_input:JSON.parse(JSON.stringify(input))});
 return result.error?dirDbError(result.error):dirOk({ok:true});
}
