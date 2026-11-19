import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';

// Round 6D (row 71): PUBLIC unsubscribe of a professional's campaign email (/baja-pro#t=…, no account).
// The token travels in the body (never logged in a URL); only its SHA-256 is stored. «peek» shows the business
// name; «confirm» suppresses the address for that business (idempotent).
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const schema=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),confirm:z.boolean()}).strict();
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return Response.json({error:'Origen no autorizado.'},{status:403,headers});
 const limited=await enforceRateLimit(req,'marketing-unsubscribe',30,60000);if(limited)return limited;
 let input;try{input=schema.parse(await proBoundedJson(req,1024));}catch{return Response.json({error:'Enlace inválido.',reason:'invalid'},{status:400,headers});}
 const result=await createAdminClient().rpc('pro_mkt_unsubscribe',{p_token:input.token,p_confirm:input.confirm});
 if(result.error)return Response.json({error:'Este enlace no es válido.',reason:result.error.code==='P0002'?'unknown':'invalid'},{status:result.error.code==='P0002'?404:400,headers});
 return Response.json(result.data,{headers});
}
