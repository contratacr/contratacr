import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {claimSendCodeSchema} from '@/lib/directory/claim-schemas';
import {generateClaimCode,hashClaimCode} from '@/lib/directory/claim-otp';
import {claimCodeSenderFor,claimEmailMode} from '@/lib/directory/claim-code-sender';
import {DIR_CLAIM_SMS_ENABLED} from '@/lib/directory/feature-flags';
import {dirDbError,dirEnabledOnly,dirFail,dirOk,dirPepper} from '@/lib/directory/public-route';
import {claimLocalEcho} from '@/lib/directory/claim-local-echo';

// LOCAL PRO ONLY (multivertical F3, development only): send the one-time code of a claim → dir_claim_send_code.
// The code is generated and HMAC-hashed here (pepper DIR_CLAIM_OTP_PEPPER, server only); only the hash reaches the
// database. Senders (claim-code-sender.ts): e-mail → EmailClaimCodeSender on the mock outbox (default) or the app's
// e-mail path in Brevo sandbox mode (nothing delivered); SMS → mock, and phone_listed is refused while
// DIR_CLAIM_SMS_ENABLED is off. E-mail codes are NEVER echoed: outside production the answer carries `testMailbox`
// (local mock mailbox route, readable only by the claimant). The SMS mock (flag on) still returns `devCode`.
// The answer never carries the real destination, only the masked one.
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-claim-code',10,60_000);if(limited)return limited;
 const pepper=dirPepper('DIR_CLAIM_OTP_PEPPER');if(!pepper)return dirFail(503,'unavailable','Los códigos no están disponibles en este momento.');
 const {id}=await params;if(!z.string().uuid().safeParse(id).success)return dirFail(404,'not_found');
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login','Inicie sesión.');
 let raw:unknown;try{raw=await proBoundedJson(req,1024);}catch{return dirFail(400,'invalid');}
 const parsed=claimSendCodeSchema.safeParse({...(raw&&typeof raw==='object'?raw:{}),claimId:id});if(!parsed.success)return dirFail(400,'invalid');
 const db=createAdminClient();
 if(!DIR_CLAIM_SMS_ENABLED){
  const view=await db.rpc('dir_claim_read',{p_actor:user.id,p_claim:id});
  if(view.error)return dirDbError(view.error);
  if((view.data as {method?:string}|null)?.method==='phone_listed')return dirFail(400,'claim_sms_disabled','Reclamar por mensaje de texto no está disponible. Use el correo.');
 }
 const code=generateClaimCode(),codeHash=await hashClaimCode(pepper,id,code);
 const result=await db.rpc('dir_claim_send_code',{p_actor:user.id,p_input:{...parsed.data,codeHash}});
 if(result.error)return dirDbError(result.error);
 const r=result.data as {status:string;channel:'sms'|'email';destination:string;destinationMasked:string;codeExpiresAt:string;sendsLeft:number};
 let local:{devCode?:string;testMailbox?:string}={};
 if(r.status==='code_sent'&&r.destination){
  const locale=req.headers.get('accept-language')?.toLowerCase().startsWith('en')?'en':'es';
  const sent=await claimCodeSenderFor(r.channel).send({claimId:id,channel:r.channel,destination:r.destination,code,locale});
  if(!sent.accepted)return dirFail(503,'unavailable','No pudimos enviar el código. Intente de nuevo en un minuto.');
  local=claimLocalEcho({nodeEnv:process.env.NODE_ENV,channel:r.channel,emailMode:claimEmailMode(),claimId:id,code});
 }
 return dirOk({status:r.status,channel:r.channel,destinationMasked:r.destinationMasked,codeExpiresAt:r.codeExpiresAt,sendsLeft:r.sendsLeft,...local});
}
