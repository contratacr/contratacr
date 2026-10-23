import {z} from 'zod';
import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {requestSocial} from '@/lib/pro/social';
export async function GET(req:Request){
 const a=await proApiAccess(req);if(a.error)return a.error;
 const {data,error}=await a.db.from('pro_social_requests').select('*').eq('user_id',a.user.id).order('created_at',{ascending:false}).limit(100);
 if(error)return proDbFailure(error);return Response.json({requests:data},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:Request){
 const a=await proApiAccess(req);if(a.error)return a.error;
 try{
 const input=z.object({id:z.string().uuid(),title:z.string(),link:z.string(),description:z.string()}).parse(await req.json());
 const row=requestSocial([],input)[0];
 const {data,error}=await a.db.rpc('pro_request_social',{p_user:a.user.id,p_id:row.id,p_title:row.title,p_link:row.link,p_description:row.description});
 if(error)return Response.json({error:error.code==='23505'?'Ya tiene una difusión para este mes.':'No se pudo solicitar la difusión.'},{status:error.code==='23505'?409:503});
 return Response.json({request:data});
 }catch{return Response.json({error:'Revise título, descripción y enlace HTTPS.'},{status:400});}
}
