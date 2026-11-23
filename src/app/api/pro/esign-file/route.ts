import {z} from 'zod';
import {proActor,proQuery} from '@/lib/pro/route-common';
import {EsignError,esignRpc} from '@/lib/pro/integrations/esign/service';
import {originalPdf,type Snapshot} from '@/lib/pro/integrations/esign/document';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6B: files of a signature request (owner only, read-only): the PDF that was sent («original», rendered
// again from the frozen snapshot — byte-identical), and once signed the stored signed PDF and audit certificate.
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow',"Content-Security-Policy":"default-src 'none'"};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const query=z.object({id:z.string().uuid(),kind:z.enum(['original','signed_pdf','certificate'])}).strict();
const fileName=(label:string,suffix:string)=>(label.normalize('NFD').replace(/[^\w .-]+/g,'').replace(/\s+/g,'-').slice(0,80)||'documento')+suffix+'.pdf';
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req),parsed=raw?query.safeParse(raw):null;if(!parsed?.success)return fail(400,'Consulta inválida.');
  if(parsed.data.kind==='original'){
   const row=await a.db.from('pro_esign_requests').select('snapshot,mode,language,document_label').eq('owner_id',a.user.id).eq('id',parsed.data.id).maybeSingle();
   if(row.error||!row.data)return fail(404,'Solicitud no encontrada.');
   const pdf=originalPdf({...(row.data.snapshot as Snapshot),language:row.data.language as 'es'|'en'},row.data.mode as string);
   return new Response(new Uint8Array(pdf),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${fileName(row.data.document_label as string,'')}"`}});
  }
  const file=await esignRpc<{base64:string;sha256:string;label:string}>(a.db,'pro_esign_artifact',{p_actor:a.user.id,p_id:parsed.data.id,p_kind:parsed.data.kind});
  const bytes=Buffer.from(file.base64,'base64');
  return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'application/pdf','X-Content-SHA256':file.sha256,'Content-Disposition':`attachment; filename="${fileName(file.label,parsed.data.kind==='certificate'?'_certificado':'_firmado')}"`}});
 }catch(error){return error instanceof EsignError?fail(error.status,error.status===404?'Archivo no disponible.':'No se pudo preparar el archivo.'):fail(503,'No se pudo preparar el archivo.');}
}
