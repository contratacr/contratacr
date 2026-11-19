import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit,enforceRateLimitKey} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';

// Post-security fixes (2026-11-13), Ley 8968 DOUBLE OPT-IN: PUBLIC confirmation of a site-form subscription
// (/confirmar-pro#t=…, no account). The token travels in the body (never in a URL); only its SHA-256 is stored and it
// is single-use. «peek» shows the business name; «confirm» turns the pending contact into «granted» once.
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const schema=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),confirm:z.boolean()}).strict();
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return Response.json({error:'Origen no autorizado.'},{status:403,headers});
 const limited=await enforceRateLimit(req,'marketing-confirm',30,60000);if(limited){for(const [k,v] of Object.entries(headers))limited.headers.set(k,v);return limited;}
 let input;try{input=schema.parse(await proBoundedJson(req,1024));}catch{return Response.json({error:'Enlace inválido.',reason:'invalid'},{status:400,headers});}
 const perToken=await enforceRateLimitKey('marketing-confirm:'+input.token.slice(0,32),20,60000);if(perToken){for(const [k,v] of Object.entries(headers))perToken.headers.set(k,v);return perToken;}
 const result=await createAdminClient().rpc('pro_mkt_confirm',{p_token:input.token,p_confirm:input.confirm});
 if(result.error)return Response.json({error:'Este enlace no es válido.',reason:result.error.code==='P0002'||result.error.code==='22023'?'unknown':'unavailable'},{status:result.error.code==='P0002'||result.error.code==='22023'?404:503,headers});
 return Response.json(result.data,{headers});
}
