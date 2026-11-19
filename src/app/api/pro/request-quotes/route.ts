import {z} from 'zod';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {requestQuoteDto,requestQuoteFailure} from '@/lib/pro/request-quotes';
const headers={'Cache-Control':'no-store, private'};
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 const user=await safeGetUser(await createClient());if(!user)return Response.json({error:'Inicie sesión.'},{status:401,headers});
 const db=createAdminClient(),profile=await db.from('profiles').select('role,is_disabled').eq('id',user.id).maybeSingle();
 if(profile.error)return requestQuoteFailure(profile.error);
 if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return Response.json({error:'Sin acceso.'},{status:403,headers});
 const parsed=z.object({quoteId:z.string().uuid()}).strict().safeParse(Object.fromEntries(new URL(req.url).searchParams));
 if(!parsed.success)return Response.json({error:'Consulta inválida.'},{status:400,headers});
 const read=await db.rpc('pro_request_quote_detail',{p_actor:user.id,p_quote:parsed.data.quoteId});
 if(read.error)return requestQuoteFailure(read.error);
 if(!read.data?.quote)return Response.json({error:'Cotización no disponible.'},{status:404,headers});
 if(read.data.configuredExtras)return Response.json({error:'Revise los complementos de esta cotización desde Citas.'},{status:409,headers});
 const professional=await db.from('professionals').select('business_name').eq('id',read.data.quote.professional_id).maybeSingle();
 return Response.json({quote:{...requestQuoteDto(read.data.quote,read.data.sourceRequestId),professional_name:professional.data?.business_name??null},sourceRequestId:read.data.sourceRequestId,workId:read.data.workId},{headers});
}
