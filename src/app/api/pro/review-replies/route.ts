import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {reviewReplyWriteSchema} from '@/lib/directory/moderation-schemas';
import {dirDbError,dirFail,dirOk} from '@/lib/directory/public-route';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// LOCAL PRO ONLY (multivertical M1, development only): public reply of the business to a review of its place.
//  POST {actionId, reviewId, reply, replyRevision} → dir_review_reply_write. One reply per review; editing sends the
//  revision shown (stale → 409 reason reload) and every version stays in the immutable reply history.
// Who: an active owner/manager of the claimed place. Lives under /api/pro so a member of the owner's Pro team goes
// through the workspace gate (the effective account becomes the owner's); the SQL then requires the member's role to
// allow listing.publish (admin/manager), like publishing prices. Pro is NOT required for the owner themself.
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404});
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-review-reply',20,60_000);if(limited)return limited;
 const a=await proActor(req);if(a.error)return a.error.status===401?dirFail(401,'login','Inicie sesión.'):a.error;
 let raw:unknown;try{raw=await proBoundedJson(req,4096);}catch{return dirFail(400,'invalid');}
 const body=reviewReplyWriteSchema.safeParse(raw);
 if(!body.success)return Response.json({error:body.error.issues[0]?.message??'Revise la respuesta.',reason:'invalid'},{status:400,headers:{'Cache-Control':'no-store, private'}});
 const member=await proWorkspaceMember();
 const result=await a.db.rpc('dir_review_reply_write',{p_actor:a.user.id,p_member:member&&member.ownerId===a.user.id?member.memberId:null,p_input:body.data});
 return result.error?dirDbError(result.error):dirOk(result.data);
}
