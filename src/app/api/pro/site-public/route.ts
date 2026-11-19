import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit,enforceRateLimitKey} from '@/lib/rate-limit';
import {proBoundedJson,proRequestOrigin,proSameOrigin} from '@/lib/pro/route-common';
import {siteConsentText,siteSlugSchema,siteSubmitSchema} from '@/lib/pro/site';

// Round 6D (row 69/70): PUBLIC side of a professional website (no account). Visits of a tracking code and the
// request form (→ customer + lead in the owner's lead center; marketing consent only if ticked, with the exact
// text shown). GET ?sitemap=1 lists the published sites (local sitemap; production would merge it into sitemap.ts).
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const fail=(status:number,reason:string,error:string)=>Response.json({error,reason},{status,headers});
const visitSchema=z.object({action:z.literal('visit'),slug:siteSlugSchema,code:z.string().regex(/^[a-z0-9]{6,16}$/)}).strict();
const submitSchema=siteSubmitSchema.extend({action:z.literal('submit'),slug:siteSlugSchema});
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 const url=new URL(req.url);if(url.searchParams.get('sitemap')!=='1'||[...url.searchParams.keys()].length!==1)return fail(400,'invalid','Consulta inválida.');
 const limited=await enforceRateLimit(req,'site-sitemap',30,60000);if(limited)return limited;
 const result=await createAdminClient().rpc('pro_site_published_slugs');if(result.error)return fail(503,'unavailable','No disponible.');
 const origin=proRequestOrigin(req),esc=(t:string)=>t.replace(/[<>&'"]/g,c=>`&#${c.charCodeAt(0)};`);
 const rows=(result.data as {slug:string;publishedAt:string}[]).map(row=>`<url><loc>${esc(origin+'/sitio/'+row.slug)}</loc><lastmod>${esc(row.publishedAt.slice(0,10))}</lastmod><xhtml:link rel="alternate" hreflang="en" href="${esc(origin+'/en/sitio/'+row.slug)}"/></url>`).join('');
 return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${rows}</urlset>`,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return fail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'site-public',30,60000);if(limited){for(const [k,v] of Object.entries(headers))limited.headers.set(k,v);return limited;}
 let raw:unknown;try{raw=await proBoundedJson(req,8192);}catch{return fail(400,'invalid','Revise los datos.');}
 const db=createAdminClient();
 try{
  const visit=visitSchema.safeParse(raw);
  if(visit.success){const result=await db.rpc('pro_site_visit',{p_slug:visit.data.slug,p_code:visit.data.code});return Response.json({counted:!result.error&&result.data===true},{headers});}
  const parsed=submitSchema.safeParse(raw);if(!parsed.success)return fail(400,'invalid','Revise los datos del formulario.');
  const input=parsed.data;
  const perSite=await enforceRateLimitKey('site-submit:'+input.slug,20,60000);if(perSite)return perSite;
  const site=await db.rpc('pro_site_public',{p_slug:input.slug});if(site.error||!site.data)return fail(404,'unknown','Este sitio no está disponible.');
  const business=String((site.data as {business?:string}).business??'');
  // The consent text stored is the one the page showed (built here again, never sent by the browser).
  const payload={submissionId:input.submissionId,name:input.name,email:input.email,phone:input.phone,message:input.message,service:input.service,area:input.area,marketingConsent:input.marketingConsent,
   consentText:input.marketingConsent?siteConsentText(business,input.language==='en'):null,code:input.code,utm:input.utm,
   // Double opt-in: a ticked box only sends a confirmation email (mock: never sent) with a link to this origin.
   ...(input.marketingConsent?{confirmBase:proRequestOrigin(req),language:input.language==='en'?'en':'es'}:{})};
  const result=await db.rpc('pro_site_submit',{p_slug:input.slug,p_input:payload});
  if(result.error)return result.error.code==='P0002'?fail(404,'unknown','Este sitio no recibe solicitudes ahora.'):result.error.code==='54000'?fail(429,'limit','Se recibieron demasiadas solicitudes. Intente de nuevo mañana o contacte al negocio por teléfono.'):result.error.code==='22023'?fail(400,'invalid','Revise los datos del formulario.'):fail(503,'unavailable','No se pudo enviar. Reintente: no se duplicará.');
  return Response.json(result.data,{headers});
 }catch{return fail(503,'unavailable','No se pudo enviar. Reintente: no se duplicará.');}
}
