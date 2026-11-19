import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {claimOpenSchema,FREE_MAIL_DOMAINS} from '@/lib/directory/claim-schemas';
import {claimDocumentsRequestSchema,claimHaciendaRequestSchema} from '@/lib/directory/moderation-schemas';
import {lookupJuridica} from '@/lib/directory/hacienda-claim';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {dirDbError,dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';
import {DIR_CLAIM_SMS_ENABLED} from '@/lib/directory/feature-flags';

// LOCAL PRO ONLY (multivertical F3 + M1, development only): «¿Es su negocio? Reclámelo gratis» → dir_claim_open.
// Signed-in only. Methods:
//  * email_listed (code to the e-mail ALREADY on the place; the claimant never types or sees it in full), email_domain
//    (address on the website's domain) and phone_listed (SMS, OFF unless DIR_CLAIM_SMS_ENABLED: 400 claim_sms_disabled)
//    → dir_claim_open (approved by the code);
//  * hacienda_juridica {cedula, legalName}: the SERVER looks the cédula jurídica up (hacienda-claim.ts adapter, mock in
//    this build) and builds the evidence only when the official name matches the typed legal name; the claim then
//    waits for staff in the admin queue (dir_claim_open_reviewed);
//  * document_review {documents:[{kind,path}]}: paths returned by /reclamo/documentos for THIS claim id and person
//    (checked again in SQL); staff decide in the admin queue.
// Claiming never reads or grants Pro.
const codeSchema=z.object({actionId:z.string().uuid(),claimId:z.string().uuid(),method:z.enum(['phone_listed','email_listed','email_domain']),email:z.string().optional(),note:z.string().optional()}).strict();
export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-claim-open',10,60_000);if(limited)return limited;
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login','Inicie sesión para reclamar el negocio.');
 let raw:unknown;try{raw=await proBoundedJson(req,4096);}catch{return dirFail(400,'invalid');}
 const method=raw&&typeof raw==='object'&&'method' in raw?(raw as {method:unknown}).method:null;
 const db=createAdminClient();
 if(method==='hacienda_juridica'){
  const body=claimHaciendaRequestSchema.safeParse(raw);
  if(!body.success)return dirFail(400,body.error.issues[0]?.path[0]==='cedula'?'cedula_invalid':'invalid');
  const lookupLimited=await enforceRateLimit(req,'dir-claim-hacienda',5,60_000);if(lookupLimited)return lookupLimited;
  const found=await lookupJuridica(body.data.cedula,body.data.legalName);
  if(found.status!=='matched')return dirFail(found.status==='unavailable'?503:400,'hacienda_'+found.status);
  const input={actionId:body.data.actionId,claimId:body.data.claimId,slug,method:'hacienda_juridica',...(body.data.note?{note:body.data.note}:{}),
   evidence:{hacienda:{cedula:body.data.cedula,officialName:found.officialName,score:found.score,matched:true,provider:'hacienda_api',checkedAt:new Date().toISOString()}}};
  if(!claimOpenSchema.safeParse(input).success)return dirFail(400,'invalid');
  const result=await db.rpc('dir_claim_open_reviewed',{p_actor:user.id,p_input:input});
  return result.error?dirDbError(result.error):dirOk({...result.data as object,officialName:found.officialName});
 }
 if(method==='document_review'){
  const body=claimDocumentsRequestSchema.safeParse(raw);if(!body.success)return dirFail(400,'invalid');
  const input={actionId:body.data.actionId,claimId:body.data.claimId,slug,method:'document_review',...(body.data.note?{note:body.data.note}:{}),evidence:{documents:body.data.documents}};
  if(!claimOpenSchema.safeParse(input).success)return dirFail(400,'claim_evidence');
  const result=await db.rpc('dir_claim_open_reviewed',{p_actor:user.id,p_input:input});
  return result.error?dirDbError(result.error):dirOk(result.data);
 }
 if(method==='phone_listed'&&!DIR_CLAIM_SMS_ENABLED)return dirFail(400,'claim_sms_disabled','Reclamar por mensaje de texto no está disponible. Use el correo.');
 const body=codeSchema.safeParse(raw);
 if(!body.success)return dirFail(400,method?'method_unavailable':'invalid');
 const parsed=claimOpenSchema.safeParse({...body.data,slug});
 if(!parsed.success){
  if(parsed.error.issues[0]?.path[0]!=='email')return dirFail(400,'invalid');
  // A free mailbox (Gmail, Hotmail…) never proves the website domain: same answer as the database (domain mismatch).
  const domain=String(body.data.email??'').trim().toLowerCase().split('@')[1]??'';
  return dirFail(400,(FREE_MAIL_DOMAINS as readonly string[]).includes(domain)?'claim_domain_mismatch':'email_invalid');
 }
 const result=await db.rpc('dir_claim_open',{p_actor:user.id,p_input:parsed.data});
 return result.error?dirDbError(result.error):dirOk(result.data);
}
