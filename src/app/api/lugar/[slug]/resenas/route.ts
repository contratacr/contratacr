import {z} from 'zod';
import {getTranslations} from 'next-intl/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {guestReviewDbInputSchema,reviewCursorSchema,reviewSubmitSchema} from '@/lib/directory/review-schemas';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {dirContactId,dirDbError,dirDeviceId,dirEnabledOnly,dirFail,dirOk,dirPepper,hmacHex} from '@/lib/directory/public-route';

// LOCAL PRO ONLY (multivertical F5, development only): reviews of a place.
//  GET  ?cursor=<base64url {at,id}> → dir_place_reviews_public (published reviews only).
//  POST {actionId, rating, comment, authorName?} → dir_review_submit. Signed in: name = profile name (snapshot);
//       one review per person and place (a second POST edits it, CAS by revision). Without an account: only after
//       contacting the place from this device (contact cookie + visitorHash), otherwise reason review_contact_required.
const postSchema=z.object({actionId:z.string().uuid(),rating:z.number(),comment:z.string().max(2000),authorName:z.string().max(200).optional()}).strict();
export async function GET(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 const raw=new URL(req.url).searchParams.get('cursor');let after:unknown=null;
 if(raw){try{after=reviewCursorSchema.parse(JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/'))));}catch{return dirFail(400,'invalid');}}
 const result=await createAdminClient().rpc('dir_place_reviews_public',{p_slug:slug,p_after:after});
 if(result.error)return dirDbError(result.error);
 if(!result.data)return dirFail(404,'not_found');
 return dirOk(result.data);
}
export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-review',10,60_000);if(limited)return limited;
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 const locale=req.headers.get('accept-language')?.toLowerCase().startsWith('en')?'en':'es';
 let raw:unknown;try{raw=await proBoundedJson(req,4096);}catch{return dirFail(400,'invalid');}
 const body=postSchema.safeParse(raw);if(!body.success)return dirFail(400,'invalid');
 const db=createAdminClient(),user=await safeGetUser(await createClient());
 if(user){
  const [mine,profile]=await Promise.all([db.rpc('dir_review_mine',{p_actor:user.id,p_slug:slug}),db.from('profiles').select('full_name').eq('id',user.id).maybeSingle()]);
  if(mine.error)return dirDbError(mine.error);
  const own=mine.data as {reviewId:string;revision:number}|null;
  const parsed=reviewSubmitSchema(locale).safeParse({actionId:body.data.actionId,reviewId:own?.reviewId??crypto.randomUUID(),slug,revision:own?.revision??0,
   rating:body.data.rating,comment:body.data.comment,authorName:(profile.data?.full_name as string|null)?.trim()||(await getTranslations({locale,namespace:'directoryRoutes'}))('reviewAuthorFallback')});
  if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message??'Revise la reseña.',reason:'invalid'},{status:400,headers:{'Cache-Control':'no-store, private'}});
  const result=await db.rpc('dir_review_submit',{p_actor:user.id,p_input:parsed.data});
  return result.error?dirDbError(result.error):dirOk(result.data);
 }
 const contactId=await dirContactId(slug),device=await dirDeviceId(false),pepper=dirPepper('DIR_VISITOR_PEPPER');
 if(!contactId||!device)return dirFail(403,'review_contact_required','Para reseñar sin cuenta, contacte primero al negocio desde ContrataCR.');
 if(!pepper)return dirFail(503,'unavailable');
 const text=reviewSubmitSchema(locale).pick({comment:true,rating:true}).safeParse({comment:body.data.comment,rating:body.data.rating});
 if(!text.success)return Response.json({error:text.error.issues[0]?.message??'Revise la reseña.',reason:'invalid'},{status:400,headers:{'Cache-Control':'no-store, private'}});
 const guest=guestReviewDbInputSchema.safeParse({actionId:body.data.actionId,reviewId:crypto.randomUUID(),slug,revision:0,rating:text.data.rating,comment:text.data.comment,
  authorName:body.data.authorName??'',contactId,visitorHash:await hmacHex(pepper,'device:'+device)});
 if(!guest.success)return dirFail(400,guest.error.issues[0]?.path[0]==='authorName'?'name_required':'invalid');
 const result=await db.rpc('dir_review_submit',{p_actor:null,p_input:guest.data});
 return result.error?dirDbError(result.error):dirOk(result.data);
}
