import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {editionChoiceSchema,editionSettingsView} from '@/lib/pro/edition-choice';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// LOCAL PRO ONLY (gaps round 2026-11-17, development only): /api/pro/editions — the self-service edition picker.
//  GET  → {ownerId, edition, active, implicit, revision, paywallEnabled, entitled, canChoose, role, modules}
//  POST {actionId, edition, revision} → pro_workspace_edition_mutate choose_edition (CAS on revision → 409,
//       idempotent actionId: the same body answers the saved result with replayed:true).
// The effective account is the workspace owner (the gate substitutes it for a company member); the PERSON acting is
// passed as p_actor so the SQL role check (settings.write = owner or company admin) applies to them. Choosing is free
// during the launch (no charge, no payment data): the SQL keeps tier and source and never touches billing.
const fail=(status:number,code:string,error:string)=>Response.json({error,code},{status,headers:proRouteHeaders});
function dbFail(error:{code?:string;hint?:string}){
 if(error.code==='40001')return fail(409,'conflict','La edición cambió. Recargue antes de elegir.');
 if(error.code==='42501'&&error.hint==='edition_inactive')return fail(403,'edition_inactive','Su edición está suspendida. Escríbanos a soporte.');
 if(error.code==='42501')return fail(403,'role','Solo el dueño o un administrador de la empresa puede elegir la edición.');
 if(error.code==='22023')return fail(400,'invalid','Revise la edición elegida.');
 return fail(503,'unavailable','No se pudo comprobar el guardado. Reintente la misma operación.');
}
async function context(req:Request){
 const a=await proActor(req);if(a.error)return {error:a.error} as const;
 const member=await proWorkspaceMember();
 const person=member&&member.ownerId===a.user.id?member.memberId:a.user.id;
 return {db:a.db,owner:a.user.id,person,error:null} as const;
}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 if([...new URL(req.url).searchParams.keys()].length)return fail(400,'invalid','Consulta inválida.');
 try{
  const c=await context(req);if(c.error)return c.error;
  const [read,role]=await Promise.all([
   c.db.rpc('pro_workspace_edition_read',{p_actor:c.person,p_owner:c.owner}),
   c.person===c.owner?Promise.resolve({data:'owner',error:null}):c.db.rpc('pro_role_of',{p_actor:c.person,p_owner:c.owner}),
  ]);
  if(read.error)return dbFail(read.error);
  if(role.error)return fail(503,'unavailable','No se pudo comprobar su rol.');
  return Response.json(editionSettingsView(read.data,typeof role.data==='string'?role.data:null),{headers:proRouteHeaders});
 }catch{return fail(503,'unavailable','No se pudo cargar la edición. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return fail(403,'origin','Origen no autorizado.');
 try{
  const c=await context(req);if(c.error)return c.error;
  const limited=await enforceRateLimit(req,'pro-editions-'+c.person,20,60000);if(limited)return limited;
  let raw:unknown;try{raw=await proBoundedJson(req,2048);}catch{return fail(400,'invalid','Revise la edición elegida.');}
  const parsed=editionChoiceSchema.safeParse(raw);if(!parsed.success)return fail(400,'invalid','Revise la edición elegida.');
  const result=await c.db.rpc('pro_workspace_edition_mutate',{p_actor:c.person,p_input:{action:'choose_edition',actionId:parsed.data.actionId,edition:parsed.data.edition,ownerId:c.owner,revision:parsed.data.revision}});
  return result.error?dbFail(result.error):Response.json(result.data,{headers:proRouteHeaders});
 }catch(error){return error instanceof z.ZodError?fail(400,'invalid','Revise la edición elegida.'):fail(503,'unavailable','No se pudo comprobar el guardado. Reintente la misma operación.');}
}
