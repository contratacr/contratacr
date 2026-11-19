import {z} from 'zod';
import {createHash,randomBytes} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {subCode,subOwnerInputSchema} from '@/lib/pro/round8';

/**
 * Round 8: owner side of subcontractor access. Invite a vendor of the directory to a job (one-use
 * code, 72 h; only its SHA-256 is kept; nothing is sent — the owner copies the code), link the
 * access to more jobs, assign tasks, share job files, comment and revoke. Scope rules live in SQL.
 * Role gate: team management (`subcontractors` → team.manage).
 */
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(){const bytes=randomBytes(12);let out='';for(const b of bytes)out+=alphabet[b%alphabet.length];return out;}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);const parsed=raw&&z.object({workId:z.string().trim().min(1).max(160)}).strict().safeParse(raw);if(!parsed||!parsed.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_sub_owner_read',{p_actor:a.user.id,p_work:parsed.data.workId});if(r.error)return proDbError(r.error,'Los accesos cambiaron.');
  return r.data?Response.json(r.data,{headers}):proFail(404,'Trabajo no disponible.');
 }catch{return proFail(503,'No se pudieron cargar los subcontratistas.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'subcontractors-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=subOwnerInputSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise los datos del subcontratista.');}
  let code:string|null=null,payload:Record<string,unknown>=input;
  if(input.action==='invite'){code=newCode();payload={...input,tokenSha256:createHash('sha256').update(subCode(code)).digest('hex')};}
  const r=await a.db.rpc('pro_sub_owner_mutate',{p_actor:a.user.id,p_input:payload});if(r.error)return proDbError(r.error,'El acceso cambió. Recargue.');
  // The raw code is shown once to the owner; a replayed invite cannot show it again (only its hash exists).
  return Response.json({...r.data,...(code&&!r.data?.replayed?{code}:{})},{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente: no se duplicará.');}
}
