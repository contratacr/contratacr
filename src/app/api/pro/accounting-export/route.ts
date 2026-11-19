import {z} from 'zod';
import {proAccountRateLimit,proActor,proInternalFinanceDenied,proQuery} from '@/lib/pro/route-common';
import {accountingCsv} from '@/lib/pro/integrations/accounting/csv';
import type {Sources} from '@/lib/pro/integrations/accounting/model';

// Round 6B: CSV export for any accounting system (owner only, read-only). Invoices («emitted» or all),
// payments and customers, in Costa Rica Excel format («;», decimal comma, BOM) or standard CSV.
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow',"Content-Security-Policy":"default-src 'none'"};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const query=z.object({kind:z.enum(['invoices','payments','customers']),format:z.enum(['cr','standard']),scope:z.enum(['emitted','all']).optional(),from:day.optional(),to:day.optional(),lang:z.enum(['es','en']).optional()}).strict();
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  // Closing round (security review M1): customers (with ID numbers), invoices and payments are for the owner,
  // Administrator and Manager only, like the customer export of /api/pro/client-contacts.
  const denied=await proInternalFinanceDenied();if(denied)return denied;
  const limited=await proAccountRateLimit('accounting-export',a.user.id,10,60000);if(limited)return limited;
  const raw=proQuery(req),parsed=raw?query.safeParse(raw):null;if(!parsed?.success)return fail(400,'Consulta inválida.');
  const q=parsed.data;if(q.from&&q.to&&q.from>q.to)return fail(400,'El rango de fechas no es válido.');
  const sources=await a.db.rpc('pro_accounting_sources',{p_actor:a.user.id,p_scope:q.scope??null});
  if(sources.error)return fail(sources.error.code==='42501'?403:503,'No se pudo preparar la exportación.');
  const csv=accountingCsv(sources.data as Sources,q.kind,q.format,{from:q.from,to:q.to},q.lang==='en');
  const name=`contratacr-${q.kind==='invoices'?(q.lang==='en'?'invoices':'facturas'):q.kind==='payments'?(q.lang==='en'?'payments':'pagos'):(q.lang==='en'?'customers':'clientes')}-${new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date())}.csv`;
  return new Response(csv,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${name}"`}});
 }catch{return fail(503,'No se pudo preparar la exportación.');}
}
