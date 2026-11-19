import {z} from 'zod';
import {proActor,proQuery} from '@/lib/pro/route-common';
import {EinvoiceError,documentFull} from '@/lib/pro/integrations/hacienda/service';
import {einvoicePrintHtml} from '@/lib/pro/integrations/hacienda/print';

// Round 6A: files of an emitted document (owner only): signed XML «clave.xml», Hacienda's answer
// «clave_respuesta.xml» and the printable representation (print / save as PDF). Read-only.
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const query=z.object({id:z.string().uuid(),kind:z.enum(['xml','response','print']),lang:z.enum(['es','en']).optional()}).strict();
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req),parsed=raw?query.safeParse(raw):null;if(!parsed?.success)return fail(400,'Consulta inválida.');
  const doc=await documentFull(a.db,a.user.id,parsed.data.id);
  if(parsed.data.kind==='xml'){
   if(!doc.signedXml)return fail(404,'Este comprobante todavía no está firmado.');
   return new Response(doc.signedXml,{headers:{...headers,'Content-Type':'application/xml; charset=utf-8','Content-Disposition':`attachment; filename="${doc.clave}.xml"`,'Content-Security-Policy':"default-src 'none'"}});
  }
  if(parsed.data.kind==='response'){
   if(!doc.responseXml)return fail(404,'Hacienda todavía no ha respondido.');
   return new Response(doc.responseXml,{headers:{...headers,'Content-Type':'application/xml; charset=utf-8','Content-Disposition':`attachment; filename="${doc.clave}_respuesta.xml"`,'Content-Security-Policy':"default-src 'none'"}});
  }
  const nonce=crypto.randomUUID().replaceAll('-','');
  return new Response(einvoicePrintHtml({...doc,docType:doc.docType},nonce,parsed.data.lang==='en'),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`}});
 }catch(error){return error instanceof EinvoiceError?fail(error.status,error.status===404?'Comprobante no encontrado.':'No se pudo preparar el archivo.'):fail(503,'No se pudo preparar el archivo.');}
}
