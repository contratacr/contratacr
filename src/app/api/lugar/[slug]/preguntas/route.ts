import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {cookies} from 'next/headers';
import {PRO_WS_COOKIE} from '@/lib/pro/workspace-gate';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {qaPostSchema} from '@/lib/directory/place-features';
import {dirDbError,dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';

// LOCAL PRO ONLY (place features round, development only): questions & answers of a place.
//  GET  → dir_place_questions_public (published questions/answers, business answers first, no ids of people).
//  POST {type:'question'} → dir_question_ask; {type:'answer'} → dir_answer_post; {type:'flag'} → dir_qa_flag_create.
//  Signed in only. Name = profile name snapshot. A company member answering for the business works in the owner's Pro
//  workspace (cookie): the answer is posted as the owner's account with p_member = the member (SQL checks the role).
async function memberContext(db:ReturnType<typeof createAdminClient>,userId:string,slug:string){
 const owner=(await cookies()).get(PRO_WS_COOKIE)?.value;
 if(!owner||!/^[0-9a-f-]{36}$/i.test(owner)||owner===userId)return null;
 const place=await db.from('dir_places').select('id').eq('slug',slug).maybeSingle();if(!place.data)return null;
 const manages=await db.from('dir_place_managers').select('id').eq('place_id',place.data.id).eq('user_id',owner).eq('status','active').maybeSingle();
 return manages.data?owner:null;
}
export async function GET(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 const limited=await enforceRateLimit(req,'dir-qa-read',60,60_000);if(limited)return limited;
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 const r=await createAdminClient().rpc('dir_place_questions_public',{p_slug:slug});
 if(r.error)return dirDbError(r.error);return r.data?dirOk(r.data):dirFail(404,'not_found');
}
export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-qa',10,60_000);if(limited)return limited;
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 const en=req.headers.get('accept-language')?.toLowerCase().startsWith('en')??false;
 let raw:unknown;try{raw=await proBoundedJson(req,4096);}catch{return dirFail(400,'invalid');}
 const body=qaPostSchema.safeParse(raw);if(!body.success)return dirFail(400,'invalid');
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login','Inicie sesión.');
 const db=createAdminClient();
 if(body.data.type==='flag'){
  const {type:_type,...flag}=body.data;void _type;
  // The question/answer must belong to this place.
  const own=flag.targetKind==='question'?await db.from('dir_questions').select('dir_places!inner(slug)').eq('id',flag.targetId).maybeSingle()
   :await db.from('dir_answers').select('dir_questions!inner(dir_places!inner(slug))').eq('id',flag.targetId).maybeSingle();
  if(own.error)return dirFail(503,'unavailable');
  const ownSlug=own.data?(flag.targetKind==='question'?(own.data as unknown as {dir_places:{slug:string}}).dir_places.slug:(own.data as unknown as {dir_questions:{dir_places:{slug:string}}}).dir_questions.dir_places.slug):null;
  if(ownSlug!==slug)return dirFail(404,'not_found');
  const r=await db.rpc('dir_qa_flag_create',{p_actor:user.id,p_input:JSON.parse(JSON.stringify(flag))});
  return r.error?dirDbError(r.error):dirOk({ok:true});
 }
 const profile=await db.from('profiles').select('full_name').eq('id',user.id).maybeSingle();
 const authorName=(profile.data?.full_name as string|null)?.trim().slice(0,80)||(en?'ContrataCR user':'Persona usuaria de ContrataCR');
 if(body.data.type==='question'){
  const {type:_t,...q}=body.data;void _t;
  const r=await db.rpc('dir_question_ask',{p_actor:user.id,p_input:{...q,slug,authorName}});
  return r.error?dirDbError(r.error):dirOk(r.data);
 }
 const {type:_t,...a}=body.data;void _t;
 // The question must belong to this place.
 const q=await db.from('dir_questions').select('dir_places!inner(slug)').eq('id',a.questionId).maybeSingle();
 if(q.error)return dirFail(503,'unavailable');if(!q.data||(q.data.dir_places as unknown as {slug:string}).slug!==slug)return dirFail(404,'not_found');
 const owner=await memberContext(db,user.id,slug);
 let actor=user.id,member:string|null=null,name=authorName;
 if(owner){
  actor=owner;member=user.id;
  const biz=await db.from('dir_places').select('name').eq('slug',slug).maybeSingle();name=(biz.data?.name as string|undefined)?.slice(0,80)??authorName;
 }else{
  const managed=await db.from('dir_places').select('id,name,dir_place_managers!inner(user_id,status)').eq('slug',slug).eq('dir_place_managers.user_id',user.id).eq('dir_place_managers.status','active').maybeSingle();
  if(managed.data)name=(managed.data.name as string).slice(0,80);
 }
 const r=await db.rpc('dir_answer_post',{p_actor:actor,p_member:member,p_input:{...a,authorName:name}});
 return r.error?dirDbError(r.error):dirOk(r.data);
}
