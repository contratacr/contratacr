import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {enforceRateLimit,enforceRateLimitKey} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {placeReportSchema,placeSlugSchema} from '@/lib/directory/schemas';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// Multivertical F1/F2 (LOCAL development only): public report / removal request of a place → dir_report_create.
// The per-IP limit lives in memory (not valid on Workers); the database caps (20 a day per place, 5 a day per
// e-mail → 54000) are the real guard. Same reportId → same answer (idempotent retries).
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const fail=(status:number,reason:string,error:string)=>Response.json({error,reason},{status,headers});
export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
 if(!DIR_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return fail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'place-report',10,60000);if(limited)return limited;
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return fail(404,'unknown','Este lugar no está disponible.');
 const perPlace=await enforceRateLimitKey('place-report:'+slug,20,60000);if(perPlace)return perPlace;
 let raw:unknown;try{raw=await proBoundedJson(req,8192);}catch{return fail(400,'invalid','Revise los datos.');}
 const parsed=placeReportSchema.safeParse(raw);if(!parsed.success)return fail(400,'invalid','Revise los datos del reporte.');
 // Signed-in reporter is recorded when present; anonymous reports are allowed.
 const user=(await (await createClient()).auth.getUser()).data.user;
 const result=await createAdminClient().rpc('dir_report_create',{p_actor:user?.id??null,p_slug:slug,p_input:{...parsed.data,email:parsed.data.email??null}});
 if(result.error){
  const code=(result.error as {code?:string}).code;
  if(code==='54000')return fail(429,'limit','Se recibieron demasiados reportes. Intente más tarde.');
  if(code==='P0002')return fail(404,'unknown','Este lugar no está disponible.');
  if(code==='22023')return fail(400,'invalid','Revise los datos del reporte.');
  return fail(503,'unavailable','No disponible.');
 }
 return Response.json({ok:true},{headers});
}
