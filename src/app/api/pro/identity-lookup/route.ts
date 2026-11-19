import {createHmac} from 'node:crypto';
import {z} from 'zod';
import {proApiAccess} from '@/lib/pro/api-access';
import {isValidId} from '@/lib/cedula';
import {getIdentityVerifier} from '@/lib/verification/identity-verifier';

const headers={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer'};
const inputSchema=z.object({identification:z.string().max(24).regex(/^[\d\s-]+$/).transform(value=>value.replace(/[\s-]/g,'')).refine(isValidId),purpose:z.enum(['client_billing','client_contact'])}).strict();
export async function GET(){return Response.json({error:'Use una consulta privada por POST.'},{status:405,headers:{...headers,Allow:'POST'}});}
export async function POST(req:Request){
 const access=await proApiAccess(req);
 if(access.error)return new Response(access.error.body,{status:access.error.status,headers:{...Object.fromEntries(access.error.headers),...headers}});
 const professional=await access.db.from('professionals').select('id,is_banned').eq('profile_id',access.user.id).maybeSingle();
 if(professional.error)return Response.json({error:'Consulta temporalmente no disponible.'},{status:503,headers});
 if(professional.data?.is_banned)return Response.json({error:'Sin acceso.'},{status:403,headers});
 // No query parameters: prevent identifications entering our request URL logs.
 if(new URL(req.url).search||!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return Response.json({error:'Solicitud inválida.'},{status:400,headers});
 let input:z.infer<typeof inputSchema>;
 try{
  const reader=req.body?.getReader();if(!reader)throw Error('body');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>512){await reader.cancel();throw Error('size');}chunks.push(value);}}finally{reader.releaseLock();}
  input=inputSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
 }catch{return Response.json({error:'Revise la identificación.'},{status:400,headers});}
 const secret=process.env.PRO_IDENTITY_RATE_LIMIT_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret||secret.length<32)return Response.json({error:'Consulta temporalmente no disponible.'},{status:503,headers});
 const token=(scope:string,value:string)=>createHmac('sha256',secret).update(`${scope}:${value}`).digest('hex');
 // Only Cloudflare's trusted ingress header in its runtime. Never trust a caller's XFF.
 let onCloudflare=false;
 try{const {getCloudflareContext}=await import('@opennextjs/cloudflare');onCloudflare=Boolean((await getCloudflareContext({async:true})).ctx);}catch{/* Local/unknown ingress shares one conservative IP bucket. */}
 const ip=onCloudflare?req.headers.get('cf-connecting-ip')||'unknown':'shared-ingress';
 try{
  const quota=await access.db.rpc('pro_identity_quota_take',{p_account:token('account',access.user.id),p_ip:token('ip',ip)});
  if(quota.error||!quota.data||typeof quota.data.allowed!=='boolean')throw Error('quota');
  if(!quota.data.allowed)return Response.json({error:'Hay demasiadas consultas.'},{status:429,headers:{...headers,'Retry-After':String(Math.max(1,Math.min(600,Number(quota.data.retryAfter)||60)))}});
  if(input.purpose==='client_contact'){
   // Only information already held by this professional. Never enumerate
   // registered profiles or expose another account's private contact details.
   const saved=await access.db.from('pro_clients').select('id').eq('user_id',access.user.id).eq('identification',input.identification).limit(1).maybeSingle();
   if(saved.error)throw Error('catalog');
   if(saved.data)return Response.json({found:true,existingClientId:saved.data.id},{headers});
   if(professional.data?.id){
    const previous=await access.db.from('quotes').select('client_name,client_email,client_phone').eq('professional_id',professional.data.id).eq('client_cedula',input.identification).is('deleted_at',null).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(previous.error)throw Error('quotes');
    if(previous.data?.client_name)return Response.json({found:true,source:'previous_quote',contact:{name:previous.data.client_name,email:previous.data.client_email||'',phone:previous.data.client_phone||''}},{headers});
   }
  }
  // Pro does not read or write the registration cache or persist lookup results.
  const result=await getIdentityVerifier().lookup(input.identification,{cache:false});
  if(result.unavailable)return Response.json({found:false},{status:503,headers});
  if(!result.found||!result.fullName)return Response.json({found:false},{status:404,headers});
  return Response.json({found:true,fullName:result.fullName,idType:result.idType},{headers});
 }catch{return Response.json({error:'Consulta temporalmente no disponible.'},{status:503,headers});}
}
