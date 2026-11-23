import {z} from 'zod';
import {proActor,proQuery} from '@/lib/pro/route-common';
import {EsignError,esignRpc} from '@/lib/pro/integrations/esign/service';
import {originalPdf,type Snapshot} from '@/lib/pro/integrations/esign/document';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6B: files of a signature request (owner only, read-only): the PDF that was sent («original», rendered
// again from the frozen snapshot — byte-identical), and once signed the stored signed PDF and audit certificate.
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow',"Content-Security-Policy":"default-src 'none'"};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const query=z.object({id:z.string().uuid(),kind:z.enum(['original','signed_pdf','certificate','evidence'])}).strict();
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
  if(parsed.data.kind==='evidence'){
   // Evidence package (row 41): a JSON manifest with the fingerprints, the timeline and the stored artifacts of the request.
   // It carries no signer address and no user agent: those are not captured by this app; the provider certificate has its own.
   const [row,events,artifacts]=await Promise.all([
    a.db.from('pro_esign_requests').select('id,document_kind,document_id,document_label,document_hash,signer_name,signer_email,language,mode,envelope_id,status,expires_at,sent_at,viewed_at,completed_at,decline_reason,created_at').eq('owner_id',a.user.id).eq('id',parsed.data.id).maybeSingle(),
    a.db.from('pro_esign_events').select('seq,status,source,at').eq('owner_id',a.user.id).eq('request_id',parsed.data.id).order('seq'),
    a.db.from('pro_esign_artifacts').select('kind,sha256,created_at').eq('owner_id',a.user.id).eq('request_id',parsed.data.id)]);
   if(row.error||!row.data||events.error||artifacts.error)return fail(row.error||events.error||artifacts.error?503:404,row.error||events.error||artifacts.error?'No se pudo preparar el archivo.':'Solicitud no encontrada.');
   const manifest={format:'contratacr-esign-evidence-v1',generatedAt:new Date().toISOString(),request:row.data,events:events.data,artifacts:artifacts.data,
    notes:{es:'La aceptación electrónica no es la Firma Digital certificada del BCCR (Ley 8454). Su validez legal debe confirmarla un abogado.',en:'Electronic acceptance is not the BCCR certified Digital Signature (Law 8454). Its legal validity must be confirmed by a lawyer.'},
    capturedFromSigner:{ipAddress:false,userAgent:false}};
   return new Response(JSON.stringify(manifest,null,2),{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${fileName(row.data.document_label as string,'_evidencia').replace(/\.pdf$/,'.json')}"`}});
  }
  const file=await esignRpc<{base64:string;sha256:string;label:string}>(a.db,'pro_esign_artifact',{p_actor:a.user.id,p_id:parsed.data.id,p_kind:parsed.data.kind});
  const bytes=Buffer.from(file.base64,'base64');
  return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'application/pdf','X-Content-SHA256':file.sha256,'Content-Disposition':`attachment; filename="${fileName(file.label,parsed.data.kind==='certificate'?'_certificado':'_firmado')}"`}});
 }catch(error){return error instanceof EsignError?fail(error.status,error.status===404?'Archivo no disponible.':'No se pudo preparar el archivo.'):fail(503,'No se pudo preparar el archivo.');}
}
