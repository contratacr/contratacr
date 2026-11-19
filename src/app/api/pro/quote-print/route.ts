import {applyDocumentBranding,printImgSrc} from '@/lib/pro/document-branding';
import {printNonce} from '@/lib/pro/print-csp';
import {loadPrintBranding} from '@/lib/pro/document-branding-server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {privateEstimateDetailSchema} from '@/lib/pro/private-estimates';
import {quotePrintHtml,quotePublicationPrintHtml} from '@/lib/pro/round10-print';
import {privateEstimatePublicationDetailSchema} from '@/lib/pro/private-estimate-publications';
import {getApiAdmin} from '@/lib/auth/admin';
// Round F2-D: `publicationId` prints a shared (published) version with the company branding of its owner, for the
// owner (and company members as the owner) or its customer, re-authorized by pro_private_estimate_publication_read
// (same visibility as the shared-quotes view: immutable published content only, never cost, margins or private notes).
// Round 10: printable quote with the company branding (customer content only: no internal cost). Owner only (company members through the gate as the owner, GET = read). Never sends or stores anything.
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const options={lang:z.enum(['es','en']).optional(),preview:z.literal('1').optional()};
const query=z.union([z.object({estimateId:z.string().uuid(),...options}).strict(),z.object({publicationId:z.string().uuid(),...options}).strict()]);
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 const params=new URL(req.url).searchParams,keys=[...params.keys()];
 const parsed=query.safeParse(Object.fromEntries(params.entries()));if(!parsed.success||new Set(keys).size!==keys.length)return fail(400,'Consulta inválida.');
 try{
  const user=await safeGetUser(await createClient());if(!user)return fail(401,'Inicie sesión.');
  const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();
  if(profile.error)return fail(503,'No se pudo comprobar el acceso.');if(!profile.data||profile.data.is_disabled)return fail(403,'Sin acceso.');
  if('publicationId' in parsed.data)return await publicationPrint(req,db,user.id,profile.data.role,parsed.data.publicationId,parsed.data.lang==='en',parsed.data.preview==='1');
  const result=await db.rpc('pro_private_estimate_read',{p_actor:user.id,p_estimate:parsed.data.estimateId,p_status:'draft',p_query:'',p_client:null,p_currency:null,p_after:null,p_kind:null,p_source:null});
  if(result.error)return fail(result.error.code==='42501'?403:result.error.code==='22023'||result.error.code==='22P02'?400:503,'No se pudo preparar el documento.');
  if(!result.data)return fail(404,'Cotización no encontrada.');
  const detail=privateEstimateDetailSchema.parse(result.data);if(detail.estimate.id!==parsed.data.estimateId||detail.estimate.ownerId!==user.id)return fail(404,'Cotización no encontrada.');
  const nonce=printNonce(req);
  const html=quotePrintHtml(detail.estimate,nonce,parsed.data.lang==='en',parsed.data.preview==='1');
  return printed(applyDocumentBranding(html,await loadPrintBranding(db,user.id),'quote'),nonce);
 }catch{return fail(503,'No se pudo preparar el documento.');}
}
const printed=(html:string,nonce:string)=>new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; ${printImgSrc}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`}});
async function publicationPrint(req:Request,db:ReturnType<typeof createAdminClient>,actor:string,role:unknown,publicationId:string,en:boolean,preview:boolean){
 // Same actor rules as /api/pro/private-estimate-publications: an admin account only through the admin check.
 if(role==='admin'&&!await getApiAdmin())return fail(403,'Sin acceso.');
 const result=await db.rpc('pro_private_estimate_publication_read',{p_actor:actor,p_publication:publicationId});
 if(result.error)return fail(result.error.code==='42501'||result.error.code==='P0002'?404:result.error.code==='22023'||result.error.code==='22P02'?400:503,'No se pudo preparar el documento.');
 if(!result.data)return fail(404,'Cotización no encontrada.');
 const detail=privateEstimatePublicationDetailSchema.parse(result.data),p=detail.publication;
 // The customer side never carries the owner's estimate id or recipient data; the owner side always has its estimate.
 if(p.publicationId!==publicationId||(detail.side==='client'?p.estimateId!==null||p.recipientBound===false||detail.recipient!==null:p.estimateId===null))return fail(503,'No se pudo preparar el documento.');
 // Branding belongs to the professional who published it (read only after the RPC authorized this actor).
 const owner=await db.from('pro_private_estimate_publications').select('owner_id').eq('id',publicationId).maybeSingle();
 if(owner.error||typeof owner.data?.owner_id!=='string')return fail(503,'No se pudo preparar el documento.');
 if(detail.side==='owner'&&owner.data.owner_id!==actor)return fail(404,'Cotización no encontrada.');
 const nonce=printNonce(req);
 return printed(applyDocumentBranding(quotePublicationPrintHtml(p,nonce,en,preview),await loadPrintBranding(db,owner.data.owner_id),'quote'),nonce);
}
