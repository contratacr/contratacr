import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {cnameTarget,domainProviderFor,hostnameOk} from '@/lib/pro/integrations/domain/provider';
import {resolveMode,storedMode} from '@/lib/pro/integrations/server';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Pro 29 (row 69): custom domain of the website. Mock adapter only: DNS instructions and a simulated verification;
// the site keeps being served at /sitio/<slug>. The «company-» prefix asks for company.write.
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('register'),hostname:z.string().trim().toLowerCase().max(253)}).strict(),
 z.object({action:z.literal('verify')}).strict(),z.object({action:z.literal('revoke')}).strict(),
]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q||Object.keys(q).length)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_site_domain_read',{p_actor:a.user.id});if(result.error)return proDbError(result.error,'Los datos cambiaron.');
  return Response.json({...(result.data as object),mode:'mock'},{headers});
 }catch{return proFail(503,'No se pudo cargar el dominio. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'company-site-domain-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=schema.parse(await proBoundedJson(req,2048));}catch{return proFail(400,'Revise los datos.');}
  const resolved=resolveMode('site_domain',await storedMode(a.db,a.user.id,'site_domain')),provider=resolved.mode==='mock'&&resolved.status==='ready'?domainProviderFor('mock'):null;
  if(input.action!=='revoke'&&!provider)return Response.json({error:'La conexión real de dominios no está activa. Solo se permite el modo de prueba.',reason:'not_active'},{status:409,headers});
  let payload:Record<string,unknown>=input;
  if(input.action==='register'){
   if(!hostnameOk(input.hostname))return proFail(400,'Escriba un dominio válido, por ejemplo www.suempresa.cr.');
   payload={action:'register',hostname:input.hostname,cnameTarget:cnameTarget(),token:randomBytes(16).toString('hex')};
  }else if(input.action==='verify'){
   const read=await a.db.rpc('pro_site_domain_read',{p_actor:a.user.id});if(read.error)return proDbError(read.error,'Los datos cambiaron.');
   const current=(read.data as {domain:{hostname:string}|null}).domain;if(!current)return proFail(404,'No hay un dominio registrado.');
   if(!(await provider!.check(current.hostname)).verified)return Response.json({error:'Los registros DNS todavía no se ven. Reintente más tarde.',reason:'dns_pending'},{status:409,headers});
  }
  const result=await a.db.rpc('pro_site_domain_mutate',{p_actor:a.user.id,p_input:payload});
  if(result.error){if(result.error.code==='P0002')return proFail(404,'No hay un dominio registrado.');return proDbError(result.error,'Ese dominio ya está en uso o su estado cambió. Actualice.');}
  return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente.');}
}
