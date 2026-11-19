import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
export async function GET(req:Request){
 const a=await proApiAccess(req);if(a.error)return a.error;
 const {data,error}=await a.db.from('pro_social_requests').select('*').eq('user_id',a.user.id).order('created_at',{ascending:false}).limit(100);
 if(error)return proDbFailure(error);return Response.json({requests:data},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:Request){const a=await proApiAccess(req);if(a.error)return a.error;return Response.json({error:'La difusión la gestiona ContrataCR. No se reciben solicitudes.'},{status:410});}
