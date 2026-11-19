import {applyDocumentBranding,printImgSrc} from '@/lib/pro/document-branding';
import {loadPrintBranding} from '@/lib/pro/document-branding-server';
import {z} from 'zod';
import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {paymentReceiptPrintHtml} from '@/lib/pro/payment-receipt-print';
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"};
function privateError(response:Response){const secured=new Headers(response.headers);for(const [key,value]of Object.entries(headers))secured.set(key,value);return new Response(response.body,{status:response.status,statusText:response.statusText,headers:secured});}
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return privateError(access.error);
 try{const id=z.string().uuid().parse(new URL(req.url).searchParams.get('id')),result=await access.db.rpc('pro_payment_receipt_read',{p_user:access.user.id,p_id:id});if(result.error)return privateError(proDbFailure(result.error));if(!result.data)return Response.json({error:'Recibo no encontrado.'},{status:404,headers});
  const nonce=crypto.randomUUID().replaceAll('-','');// Round 9: company branding.
  const html=applyDocumentBranding(paymentReceiptPrintHtml(result.data,nonce,new URL(req.url).searchParams.get('preview')==='1'),await loadPrintBranding(access.db,access.user.id),'receipt');return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; ${printImgSrc}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`}});
 }catch{return Response.json({error:'Consulta inválida.'},{status:400,headers});}
}
