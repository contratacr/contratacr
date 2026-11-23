import {applyDocumentBranding,printImgSrc} from '@/lib/pro/document-branding';
import {printNonce} from '@/lib/pro/print-csp';
import {loadPrintBranding} from '@/lib/pro/document-branding-server';
import {z} from 'zod';
import {proActor,proQuery} from '@/lib/pro/route-common';
import {paymentPlanReadSchema} from '@/lib/pro/payment-plan';
import {paymentPlanPrintHtml} from '@/lib/pro/payment-plan-print';
import {PRO_ENABLED} from '@/lib/pro/enabled';
// Round 5: printable payment plan of one job (owner only). Never sends or stores anything.
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const query=z.object({workId:z.string().trim().min(1).max(160),lang:z.enum(['es','en']).optional(),preview:z.literal('1').optional()}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req),parsed=raw?query.safeParse(raw):null;if(!parsed?.success)return fail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_payment_plan_read',{p_actor:a.user.id,p_work:parsed.data.workId});
  if(result.error)return fail(result.error.code==='42501'?403:result.error.code==='22023'?400:503,'No se pudo preparar el plan de pagos.');
  if(!result.data)return fail(404,'Trabajo no disponible.');
  const data=paymentPlanReadSchema.parse(result.data);if(!data.plan)return fail(404,'Este trabajo no tiene un plan de pagos activo.');
  const profile=await a.db.from('profiles').select('full_name').eq('id',a.user.id).maybeSingle();
  const business=await a.db.from('professionals').select('business_name').eq('profile_id',a.user.id).maybeSingle();
  const issuer=(business.data?.business_name as string|null)||(profile.data?.full_name as string|null)||null;
  const nonce=printNonce(req);
  const html=paymentPlanPrintHtml(data,{issuer,generatedAt:new Date()},nonce,parsed.data.lang==='en',parsed.data.preview==='1');
  // Round 9: company branding of the document's owner.
  const branded=applyDocumentBranding(html,await loadPrintBranding(a.db,a.user.id),'payment_plan');
  return new Response(branded,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; ${printImgSrc}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`}});
 }catch{return fail(503,'No se pudo preparar el plan de pagos.');}
}
