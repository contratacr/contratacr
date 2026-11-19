import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {claimVerifyCodeSchema} from '@/lib/directory/claim-schemas';
import {hashClaimCode} from '@/lib/directory/claim-otp';
import {dirDbError,dirEnabledOnly,dirFail,dirOk,dirPepper} from '@/lib/directory/public-route';

// LOCAL PRO ONLY (multivertical F3, development only): check the typed code → dir_claim_verify_code. The code is
// hashed here; a wrong code is a normal answer (200, verified:false, attemptsLeft), never an exception.
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-claim-verify',20,60_000);if(limited)return limited;
 const pepper=dirPepper('DIR_CLAIM_OTP_PEPPER');if(!pepper)return dirFail(503,'unavailable','Los códigos no están disponibles en este momento.');
 const {id}=await params;if(!z.string().uuid().safeParse(id).success)return dirFail(404,'not_found');
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login','Inicie sesión.');
 let raw:unknown;try{raw=await proBoundedJson(req,1024);}catch{return dirFail(400,'invalid');}
 const parsed=claimVerifyCodeSchema.safeParse({...(raw&&typeof raw==='object'?raw:{}),claimId:id});if(!parsed.success)return dirFail(400,'code_format','Escriba los 6 dígitos.');
 const {code,...rest}=parsed.data;
 const result=await createAdminClient().rpc('dir_claim_verify_code',{p_actor:user.id,p_input:{...rest,codeHash:await hashClaimCode(pepper,id,code)}});
 return result.error?dirDbError(result.error):dirOk(result.data);
}
