import {cookies} from 'next/headers';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';
import {PRO_WS_COOKIE} from '@/lib/pro/workspace-gate';
import {reviewReplyWriteSchema} from '@/lib/directory/moderation-schemas';
import {businessContext} from '@/lib/directory/business-access';
import {dirDbError,dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';

// Launch without Pro (2026-11-18): public reply of the business to a review of its place (moved out of
// /api/pro/review-replies, which stays for compatibility). POST {actionId, reviewId, reply, replyRevision} →
// dir_review_reply_write. The owner/managers of the claimed place reply as themselves (no Pro). Only while Pro is on,
// a member of the owner's Pro company (workspace cookie, like /api/lugar/[slug]/preguntas) replies for the owner with
// p_member = the member; the SQL then requires the member's role to allow listing.publish (admin/manager).
export async function POST(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-review-reply',20,60_000);if(limited)return limited;
 const c=await businessContext(req);if(c.error)return c.error;const {db,actor:user}=c.ctx;
 let raw:unknown;try{raw=await proBoundedJson(req,4096);}catch{return dirFail(400,'invalid');}
 const body=reviewReplyWriteSchema.safeParse(raw);
 if(!body.success)return Response.json({error:body.error.issues[0]?.message??'Revise la respuesta.',reason:'invalid'},{status:400,headers:{'Cache-Control':'no-store, private'}});
 let actor=user,member:string|null=null;
 if(PRO_ENABLED){
  const owner=(await cookies()).get(PRO_WS_COOKIE)?.value;
  if(owner&&owner!==user&&/^[0-9a-f-]{36}$/i.test(owner)){
   const own=await db.from('dir_reviews').select('place_id').eq('id',body.data.reviewId).maybeSingle();
   const manages=own.data?await db.from('dir_place_managers').select('id').eq('place_id',own.data.place_id).eq('user_id',user).eq('status','active').maybeSingle():null;
   if(!manages?.data){actor=owner;member=user;}
  }
 }
 const result=await db.rpc('dir_review_reply_write',{p_actor:actor,p_member:member,p_input:body.data});
 return result.error?dirDbError(result.error):dirOk(result.data);
}
