import {applyDocumentBranding,printImgSrc} from '@/lib/pro/document-branding';
import {loadPrintBranding} from '@/lib/pro/document-branding-server';
import {z} from 'zod';
import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {invoicePrintHtml} from '@/lib/pro/invoice-print';
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"};
function privatePrintError(response:Response){const secured=new Headers(response.headers);for(const [key,value]of Object.entries(headers))secured.set(key,value);return new Response(response.body,{status:response.status,statusText:response.statusText,headers:secured});}
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return privatePrintError(access.error);
 try{const id=z.string().uuid().parse(new URL(req.url).searchParams.get('id'));
 const result=await access.db.rpc('pro_invoice_extras_read',{p_user:access.user.id,p_id:id,p_after:null});if(result.error)return privatePrintError(proDbFailure(result.error));if(!result.data)return Response.json({error:'Borrador no encontrado.'},{status:404,headers});
 const state=await access.db.rpc('pro_invoice_management_read',{p_user:access.user.id,p_id:id});if(state.error)return privatePrintError(proDbFailure(state.error));
 const nonce=crypto.randomUUID().replaceAll('-','');// Round 9: company branding (theme, logo, header and footer lines).
 const html=applyDocumentBranding(invoicePrintHtml(result.data,nonce,!!state.data?.archived),await loadPrintBranding(access.db,access.user.id),'invoice');return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; ${printImgSrc}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`}});
 }catch{return Response.json({error:'Consulta inválida.'},{status:400,headers});}
}
