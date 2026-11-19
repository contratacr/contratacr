import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {claimMockOutbox} from '@/lib/directory/claim-otp';
import {claimEmailMode} from '@/lib/directory/claim-code-sender';
import {dirDbError,dirDevOnly,dirFail,dirOk} from '@/lib/directory/public-route';

const LOOPBACK=/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
/** Test-only escape for a LOCAL production build (next start on loopback, e.g. the E2E mirror): DIR_TEST_MAILBOX=1 AND the
 *  request host AND the Supabase URL are loopback. A deployed site (real host, remote Supabase) never qualifies. */
function localProdTestMailbox(req:Request){
 if(process.env.DIR_TEST_MAILBOX!=='1')return false;
 let host='',supa='';try{host=new URL(req.url).host;supa=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??'').host;}catch{return false;}
 const hdr=req.headers.get('host')??'';
 return LOOPBACK.test(host)&&LOOPBACK.test(hdr)&&LOOPBACK.test(supa);
}

// LOCAL ONLY (claim by e-mail, development only: 404 in any other build, except the loopback test mirror above). «Test mailbox»: the latest e-mail the
// MOCK sender recorded for this claim (subject, text, code), so a developer or the E2E can finish an email_listed /
// email_domain claim without any real delivery. Only the claimant (signed in) can read it, and the address is
// returned masked, exactly as the claim block shows it. Nothing here exists in sandbox mode (Brevo keeps nothing).
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const dev=dirDevOnly();if(dev&&!localProdTestMailbox(req))return dev;
 const limited=await enforceRateLimit(req,'dir-claim-mailbox',30,60_000);if(limited)return limited;
 const {id}=await params;if(!z.string().uuid().safeParse(id).success)return dirFail(404,'not_found');
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login','Inicie sesión.');
 const view=await createAdminClient().rpc('dir_claim_read',{p_actor:user.id,p_claim:id});
 if(view.error)return dirDbError(view.error);
 const claim=view.data as {destinationMasked:string|null}|null;if(!claim)return dirFail(404,'not_found');
 if(claimEmailMode()!=='mock')return dirFail(404,'not_found','El buzón de prueba solo existe en modo simulado.');
 const mail=[...claimMockOutbox()].reverse().find(m=>m.claimId.toLowerCase()===id.toLowerCase()&&m.channel==='email');
 if(!mail)return dirFail(404,'not_found','Todavía no hay correo para este reclamo.');
 return dirOk({channel:mail.channel,to:claim.destinationMasked,subject:mail.subject,text:mail.text,code:mail.code,sentAt:mail.sentAt});
}
