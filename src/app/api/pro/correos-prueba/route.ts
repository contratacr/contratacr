import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proFail,proQuery,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {transactionalEmailMode,transactionalMockOutbox} from '@/lib/pro/transactional-email';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// LOCAL PRO ONLY (launch fix I5, development only: 404 in any other build). «Test mailbox» of the Pro transactional
// e-mails recorded by the MOCK mode (src/lib/pro/transactional-email.ts): lets a developer or the E2E assert «an
// e-mail was queued to X with subject Y» without any delivery. A signed-in account only sees the e-mails it caused
// (actor) or the ones addressed to its own e-mail. Nothing exists here in sandbox mode (Brevo keeps nothing).
const querySchema=z.object({
 kind:z.enum(['quote_shared','quote_accepted','quote_declined','project_invite','team_invite','invoice_issued']).optional(),
 to:z.string().trim().toLowerCase().email().max(254).optional(),
}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const limited=await enforceRateLimit(req,'pro-test-mailbox',60,60_000);if(limited)return limited;
 const raw=proQuery(req);const q=raw&&querySchema.safeParse(raw);if(!q||!q.success)return proFail(400,'Consulta inválida.');
 const user=await safeGetUser(await createClient());if(!user)return proFail(401,'Inicie sesión.');
 if(transactionalEmailMode()!=='mock')return proFail(404,'El buzón de prueba solo existe en modo simulado.');
 const own=(user.email??'').trim().toLowerCase();
 const items=transactionalMockOutbox()
  .filter(mail=>(mail.actorId===user.id||own!==''&&mail.to===own)&&(!q.data.kind||mail.kind===q.data.kind)&&(!q.data.to||mail.to===q.data.to))
  .slice(-50).reverse()
  .map(({kind,to,subject,text,link,locale,mode,at})=>({kind,to,subject,text,link,locale,mode,at}));
 return Response.json({mode:'mock',items},{headers});
}
