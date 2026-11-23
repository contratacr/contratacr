import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {defaultSiteContent,siteContentSchema,siteSlugSchema,siteThemes,slugify,type SiteProfile} from '@/lib/pro/site';
import {resolveMode,storedMode} from '@/lib/pro/integrations/server';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6D (row 69): owner side of the website builder. Draft (CAS + actionId), publish = immutable version,
// unpublish, custom domain request (stored only; the site_domain provider is not active).
const id=z.string().uuid(),revision=z.number().int().min(0).max(2147483646);
const mutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),actionId:id,revision,slug:siteSlugSchema,theme:z.enum(siteThemes),content:siteContentSchema}).strict(),
 z.object({action:z.enum(['publish','unpublish']),actionId:id,revision}).strict(),
 z.object({action:z.literal('domain'),actionId:id,revision,customDomain:z.union([z.literal(''),z.string().trim().toLowerCase().regex(/^([a-z0-9-]{1,63}\.)+[a-z]{2,24}$/)])}).strict(),
]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const result=await a.db.rpc('pro_site_read',{p_actor:a.user.id});if(result.error)return proDbError(result.error,'El sitio cambió.');
  const data=result.data as {site:unknown;profile:SiteProfile};const en=new URL(req.url).searchParams.get('lang')==='en';
  const domain=resolveMode('site_domain',await storedMode(a.db,a.user.id,'site_domain'));
  return Response.json({...data,defaults:{slug:slugify(data.profile.businessName??''),content:defaultSiteContent(data.profile,en)},domainMode:domain.mode},{headers});
 }catch{return proFail(503,'No se pudo cargar el sitio. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'site-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=mutationSchema.parse(await proBoundedJson(req,96*1024));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise el contenido del sitio.');}
  const result=await a.db.rpc('pro_site_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error){
   if(result.error.hint==='pro_site_foreign_photo')return Response.json({error:'Las fotos deben venir de su perfil de ContrataCR.',reason:'foreign_photo'},{status:400,headers});
   if(result.error.code==='23505')return Response.json({error:'Esa dirección ya está en uso. Elija otra.',reason:'slug_taken'},{status:409,headers});
   return proDbError(result.error,'El sitio cambió. Actualice antes de guardar.');
  }
  return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
