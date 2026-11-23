import {applyDocumentBranding,printImgSrc} from '@/lib/pro/document-branding';
import {printNonce} from '@/lib/pro/print-csp';
import {loadPrintBranding} from '@/lib/pro/document-branding-server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {purchaseOrderDetailSchema} from '@/lib/pro/purchase-orders';
import {purchaseOrderPrintHtml} from '@/lib/pro/purchase-order-print';
import {proInternalFinanceAllowed} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';
// Printable copy of one purchase order (owner only). Never sends or stores anything.
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const query=z.object({workId:z.string().trim().min(1).max(160),id:z.string().uuid(),lang:z.enum(['es','en']).optional(),preview:z.literal('1').optional()}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const params=new URL(req.url).searchParams,keys=[...params.keys()];
 const parsed=query.safeParse(Object.fromEntries(params.entries()));if(!parsed.success||new Set(keys).size!==keys.length)return fail(400,'Consulta inválida.');
 try{
  const user=await safeGetUser(await createClient());if(!user)return fail(401,'Inicie sesión.');
  // Closing round (security review M2): the printable order shows internal costs.
  if(!await proInternalFinanceAllowed())return fail(403,'Su rol en esta empresa no permite ver costos, márgenes ni reportes financieros.');
  const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled,full_name').eq('id',user.id).maybeSingle();
  if(profile.error)return fail(503,'No se pudo comprobar el acceso.');if(!profile.data||profile.data.is_disabled)return fail(403,'Sin acceso.');
  const result=await db.rpc('pro_purchase_orders_read',{p_actor:user.id,p_query:{workId:parsed.data.workId,view:'detail',id:parsed.data.id}});
  if(result.error)return fail(result.error.code==='42501'?403:result.error.code==='22023'||result.error.code==='22P02'?400:503,'No se pudo preparar la orden de compra.');
  if(!result.data)return fail(404,'Trabajo no disponible.');
  const detail=purchaseOrderDetailSchema.parse(result.data);if(!detail.order)return fail(404,'Orden de compra no encontrada.');
  const nonce=printNonce(req);
  const html=purchaseOrderPrintHtml(detail.order,{workTitle:'workTitle' in detail?detail.workTitle:'',issuer:(profile.data.full_name as string|null)||null},nonce,parsed.data.lang==='en',parsed.data.preview==='1');
  // Round 9: company branding of the document's owner.
  const branded=applyDocumentBranding(html,await loadPrintBranding(db,user.id),'purchase_order');
  return new Response(branded,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; ${printImgSrc}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`}});
 }catch{return fail(503,'No se pudo preparar la orden de compra.');}
}
