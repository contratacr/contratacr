import {applyDocumentBranding,printImgSrc} from '@/lib/pro/document-branding';
import {printNonce} from '@/lib/pro/print-csp';
import {loadPrintBranding} from '@/lib/pro/document-branding-server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {allowanceDetailSchema} from '@/lib/pro/allowances';
import {allowancesPrintHtml} from '@/lib/pro/round10-print';
import {PRO_ENABLED} from '@/lib/pro/enabled';
// Family 75: printable allowances sheet with the company branding (no internal notes). Owner only, GET = read. Never sends or stores anything.
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const query=z.object({workId:z.string().trim().min(1).max(160),lang:z.enum(['es','en']).optional(),preview:z.literal('1').optional()}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const params=new URL(req.url).searchParams,keys=[...params.keys()];
 const parsed=query.safeParse(Object.fromEntries(params.entries()));if(!parsed.success||new Set(keys).size!==keys.length)return fail(400,'Consulta inválida.');
 try{
  const user=await safeGetUser(await createClient());if(!user)return fail(401,'Inicie sesión.');
  const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled').eq('id',user.id).maybeSingle();
  if(profile.error)return fail(503,'No se pudo comprobar el acceso.');if(!profile.data||profile.data.is_disabled)return fail(403,'Sin acceso.');
  const result=await db.rpc('pro_work_allowances_read',{p_actor:user.id,p_work:parsed.data.workId});
  if(result.error)return fail(result.error.code==='42501'?403:result.error.code==='22023'||result.error.code==='22P02'?400:503,'No se pudo preparar el documento.');
  if(!result.data)return fail(404,'Trabajo no disponible.');
  const work=await db.from('pro_work').select('service,client').eq('user_id',user.id).eq('id',parsed.data.workId).maybeSingle();
  if(work.error)return fail(503,'No se pudo preparar el documento.');if(!work.data)return fail(404,'Trabajo no disponible.');
  const detail=allowanceDetailSchema.parse(result.data);
  const nonce=printNonce(req);
  const html=allowancesPrintHtml({service:String(work.data.service??''),client:String(work.data.client??''),today:detail.today,items:detail.items.filter(i=>!i.archived),totals:detail.totals},nonce,parsed.data.lang==='en',parsed.data.preview==='1');
  const branded=applyDocumentBranding(html,await loadPrintBranding(db,user.id),'selections');
  return new Response(branded,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; ${printImgSrc}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`}});
 }catch{return fail(503,'No se pudo preparar el documento.');}
}
