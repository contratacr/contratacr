import {applyDocumentBranding,printImgSrc} from '@/lib/pro/document-branding';
import {printNonce} from '@/lib/pro/print-csp';
import {loadPrintBranding} from '@/lib/pro/document-branding-server';
import {z} from 'zod';
import {proApiAccess} from '@/lib/pro/api-access';
import {clientStatementCursor,type ClientStatementPage} from '@/lib/pro/client-statement';
import {clientStatementPrintHtml} from '@/lib/pro/client-statement-print';
// Round 4A: printable account statement of one customer (owner only). Never sends or stores anything.
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const query=z.object({clientId:z.string().min(1).max(160),lang:z.enum(['es','en']).optional(),preview:z.literal('1').optional()}).strict();
const PAGES=50;
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 const params=new URL(req.url).searchParams,keys=[...params.keys()];
 const parsed=query.safeParse(Object.fromEntries(params.entries()));if(!parsed.success||new Set(keys).size!==keys.length)return fail(400,'Consulta inválida.');
 try{
  let first:ClientStatementPage|null=null,after:z.infer<typeof clientStatementCursor>|null=null,truncated=false;const items:ClientStatementPage['items']=[];
  for(let index=0;index<PAGES;index++){
   const result=await access.db.rpc('pro_client_statement_page',{p_user:access.user.id,p_client:parsed.data.clientId,p_after:after});
   if(result.error)return fail(result.error.code==='22023'?400:503,'No se pudo preparar el estado de cuenta.');
   if(!result.data)return fail(404,'Cliente no encontrado.');
   const page=result.data as ClientStatementPage&{nextCursor:unknown};
   // Every page must belong to the same statement version; otherwise the copy would mix two states.
   if(first&&page.revision!==first.revision)return fail(409,'El estado de cuenta cambió. Vuelva a abrir la copia.');
   first??=page;items.push(...page.items);
   if(!page.nextCursor){after=null;break;}
   after=clientStatementCursor.parse(page.nextCursor);if(index===PAGES-1)truncated=true;
  }
  const profile=await access.db.from('profiles').select('full_name').eq('id',access.user.id).maybeSingle();
  const business=await access.db.from('professionals').select('business_name').eq('profile_id',access.user.id).maybeSingle();
  const issuer=(business.data?.business_name as string|null)||(profile.data?.full_name as string|null)||null;
  const nonce=printNonce(req);
  const html=clientStatementPrintHtml({...first!,items},{issuer,generatedAt:new Date(),truncated},nonce,parsed.data.lang==='en',parsed.data.preview==='1');
  // Round 9: company branding of the document's owner.
  const branded=applyDocumentBranding(html,await loadPrintBranding(access.db,access.user.id));
  return new Response(branded,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; ${printImgSrc}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`}});
 }catch{return fail(503,'No se pudo preparar el estado de cuenta.');}
}
