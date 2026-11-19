import {applyDocumentBranding,printImgSrc} from '@/lib/pro/document-branding';
import {printNonce} from '@/lib/pro/print-csp';
import {loadPrintBranding} from '@/lib/pro/document-branding-server';
import {z} from 'zod';
import {proActor,proQuery} from '@/lib/pro/route-common';
import {clientContractsSchema,contractDetailSchema} from '@/lib/pro/contracts';
import {contractPrintHtml,type ContractPrintSource} from '@/lib/pro/contract-print';
// Printable copy of one contract: the owner (latest or a chosen version, or the draft preview)
// or the linked customer (the shared version they can see). Never sends or stores anything.
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const owner=z.object({workId:z.string().trim().min(1).max(160),id:z.string().uuid(),version:z.string().regex(/^[1-9]\d{0,5}$/).optional(),lang:z.enum(['es','en']).optional(),preview:z.literal('1').optional()}).strict();
const customer=z.object({requestId:z.string().uuid(),id:z.string().uuid(),lang:z.enum(['es','en']).optional(),preview:z.literal('1').optional()}).strict();
const status=(code?:string)=>code==='42501'?403:code==='22023'||code==='22P02'?400:503;
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 const q=proQuery(req);if(!q)return fail(400,'Consulta inválida.');
 const asOwner=owner.safeParse(q),asCustomer=asOwner.success?null:customer.safeParse(q);
 if(!asOwner.success&&!asCustomer?.success)return fail(400,'Consulta inválida.');
 try{
  const a=await proActor(req);if(a.error)return a.error;let source:ContractPrintSource|null=null;
  if(asOwner.success){
   const result=await a.db.rpc('pro_contract_read',{p_actor:a.user.id,p_work:asOwner.data.workId,p_contract:asOwner.data.id});
   if(result.error)return fail(status(result.error.code),'No se pudo preparar el contrato.');if(!result.data)return fail(404,'Contrato no disponible.');
   const detail=contractDetailSchema.parse(result.data),wanted=asOwner.data.version?Number(asOwner.data.version):detail.contract.status==='draft'?null:detail.contract.latestVersion;
   const version=wanted===null?null:detail.versions.find(v=>v.version===wanted);if(wanted!==null&&!version)return fail(404,'Versión no disponible.');
   if(version)source={content:version.content,status:wanted===detail.contract.latestVersion?detail.contract.status:version.response?(version.response.action==='accept'?'accepted':'declined'):'superseded',version:version.version,contentHash:version.contentHash,sharedAt:version.sharedAt,response:version.response,voidReason:wanted===detail.contract.latestVersion?detail.contract.voidReason:null};
   else{
    // Draft: live preview; unresolved fields stay visible as {{field}}.
    const p=detail.preview,f=p.fields;
    source={status:'draft',version:null,contentHash:null,sharedAt:null,response:null,voidReason:null,content:{code:detail.contract.code,title:p.title,language:detail.contract.language,sharedOn:new Date().toLocaleDateString('en-CA',{timeZone:'America/Costa_Rica'}),
     company:{name:f['empresa.nombre'],identification:f['empresa.identificacion']},client:{name:f['cliente.nombre'],identification:f['cliente.identificacion']},project:{name:f['proyecto.nombre'],address:f['proyecto.direccion']},
     estimate:detail.estimate&&detail.estimate.status!=='other'?{code:detail.estimate.code,title:detail.estimate.title,status:detail.estimate.status,currency:detail.estimate.currency,totalCents:detail.estimate.totalCents}:null,
     depositPercent:detail.contract.depositPercent,clauses:p.clauses.length?p.clauses.map((c,i)=>({position:i+1,title:c.title,body:c.body})):[{position:1,title:'—',body:'—'}]}};
   }
  }else if(asCustomer?.success){
   const result=await a.db.rpc('pro_contracts_client_read',{p_actor:a.user.id,p_request:asCustomer.data.requestId});
   if(result.error)return fail(status(result.error.code),'No se pudo preparar el contrato.');if(!result.data)return fail(404,'Cita no disponible.');
   const view=clientContractsSchema.parse(result.data);const item=view.visible?view.contracts.find(c=>c.id===asCustomer.data.id):undefined;if(!item)return fail(404,'Contrato no disponible.');
   source={content:item.content,status:item.status,version:item.version,contentHash:item.contentHash,sharedAt:item.sharedAt,response:item.response,voidReason:item.voidReason};
  }
  if(!source)return fail(400,'Consulta inválida.');
  const lang=(asOwner.success?asOwner.data.lang:asCustomer?.data?.lang)??source.content.language,preview=(asOwner.success?asOwner.data.preview:asCustomer?.data?.preview)==='1';
  const nonce=printNonce(req);
  const html=contractPrintHtml(source,nonce,lang==='en',preview);
  // Round 9: company branding of the document's owner.
  const owner=asOwner.success?a.user.id:asCustomer?.success?((await a.db.from('pro_appointment_requests').select('owner_id').eq('id',asCustomer.data.requestId).maybeSingle()).data?.owner_id as string|undefined):undefined;
  const branded=applyDocumentBranding(html,await loadPrintBranding(a.db,owner),'contract');
  return new Response(branded,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; ${printImgSrc}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`}});
 }catch{return fail(503,'No se pudo preparar el contrato.');}
}
