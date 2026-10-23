import {z} from 'zod';
import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
const https=z.string().url().refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;});
export async function GET(req:Request){
 const a=await proApiAccess(req,true);if(a.error)return a.error;
 const search=new URL(req.url).searchParams.get('q');
 if(search!==null){
  const term=search.replace(/[^\p{L}\p{N}@. _-]/gu,'').trim().slice(0,100);
  if(term.length<2)return Response.json({accounts:[]});
  const {data,error}=await a.db.from('profiles').select('id,full_name,email,role,is_provider,is_disabled').or(`full_name.ilike.%${term}%,email.ilike.%${term}%`).order('full_name').limit(20);
  if(error)return proDbFailure(error);return Response.json({accounts:data},{headers:{'Cache-Control':'no-store'}});
 }
 const userId=new URL(req.url).searchParams.get('userId');
 if(userId){
  if(!z.string().uuid().safeParse(userId).success)return Response.json({error:'ID inválido'},{status:400});
  const {data:profile,error}=await a.db.from('profiles').select('id,full_name,role,is_disabled').eq('id',userId).maybeSingle();
  if(error)return proDbFailure(error);if(!profile)return Response.json({error:'Cuenta no encontrada'},{status:404});
  const {data:membership,error:membershipError}=await a.db.from('pro_memberships').select('status,expires_at,updated_at').eq('user_id',userId).maybeSingle();
  if(membershipError)return proDbFailure(membershipError);
  return Response.json({profile,membership},{headers:{'Cache-Control':'no-store'}});
 }
 const page=Math.max(0,Number(new URL(req.url).searchParams.get('page'))||0);
 const {data,error,count}=await a.db.from('pro_social_requests').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id').range(page*20,page*20+19);
 if(error)return proDbFailure(error);return Response.json({requests:data,total:count},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:Request){
 const a=await proApiAccess(req,true);if(a.error)return a.error;
 try{
 const body=z.discriminatedUnion('action',[
 z.object({action:z.literal('membership'),userId:z.string().uuid(),status:z.enum(['active','inactive']),expiresAt:z.string().datetime().nullable(),reason:z.string().trim().min(1).max(1000)}),
 z.object({action:z.literal('review'),id:z.string().uuid(),status:z.enum(['approved','rejected','published']),note:z.string().max(1000),publishedUrl:z.union([z.literal(''),https])})]).parse(await req.json());
 if(body.action==='membership'){
 if(body.status==='active'){
 const {data:target,error:targetError}=await a.db.from('profiles').select('role,is_provider,is_disabled').eq('id',body.userId).maybeSingle();
 if(targetError)return proDbFailure(targetError);
 if(!target||target.is_disabled||!(target.role==='admin'||target.role==='professional'||target.is_provider))return Response.json({error:'La cuenta debe tener un perfil profesional activo antes de activar Pro.'},{status:400});
 }

 const {error}=await a.db.rpc('pro_set_membership',{p_actor:a.user.id,p_user:body.userId,p_status:body.status,p_expires:body.expiresAt,p_reason:body.reason});
 if(error)return proDbFailure(error);
 }else{
 if(body.status==='rejected'&&!body.note.trim()||body.status==='published'&&!body.publishedUrl)return Response.json({error:'Falta motivo o enlace publicado'},{status:400});
 const {error}=await a.db.rpc('pro_review_social',{p_actor:a.user.id,p_id:body.id,p_status:body.status,p_note:body.note,p_url:body.publishedUrl});
 if(error)return Response.json({error:'La solicitud cambió o esa transición no está permitida.'},{status:409});
 }
 return Response.json({ok:true});
 }catch{return Response.json({error:'Datos inválidos'},{status:400});}
}
