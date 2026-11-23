import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit,enforceRateLimitKey} from '@/lib/rate-limit';
import {proBoundedForm,proQuery,proSameOrigin} from '@/lib/pro/route-common';
import {isOneClickBody} from '@/lib/pro/integrations/marketing/unsubscribe-links';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Post-security fixes (2026-11-13): RFC 8058 ONE-CLICK unsubscribe of a professional's campaign email. The mailbox
// provider POSTs `List-Unsubscribe=One-Click` (form-encoded) to the `List-Unsubscribe` URI, without cookies or
// Origin, so the same-origin rule is waived ONLY for that exact body. The token is in the query (a fragment is never
// sent); only its SHA-256 is stored. Idempotent (pro_mkt_unsubscribe), rate-limited per address and per token, and
// the answer is the SAME for a valid, unknown, used or malformed token (no enumeration). GET never unsubscribes
// (link prefetchers): it only sends the person to the confirmation page.
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const done=()=>new Response('OK',{status:200,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
const tokenOf=(req:Request)=>{const q=proQuery(req);return q&&Object.keys(q).length===1&&/^[a-f0-9]{64}$/.test(q.t??'')?q.t!:null;};
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const token=tokenOf(req);
 return new Response(null,{status:303,headers:{...headers,Location:token?'/baja-pro#t='+token:'/baja-pro'}});
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const limited=await enforceRateLimit(req,'marketing-one-click',60,60000);if(limited){for(const [k,v] of Object.entries(headers))limited.headers.set(k,v);return limited;}
 let oneClick=false;
 try{oneClick=isOneClickBody(await proBoundedForm(req,{maxBytes:512,maxFiles:0,fields:['List-Unsubscribe'],types:['application/x-www-form-urlencoded','multipart/form-data']}));}catch{oneClick=false;}
 // Anything that is not the exact one-click body keeps the normal same-origin rule (and is refused here anyway).
 if(!oneClick)return proSameOrigin(req)?Response.json({error:'Solicitud inválida.'},{status:400,headers}):Response.json({error:'Origen no autorizado.'},{status:403,headers});
 const token=tokenOf(req);if(!token)return done();
 const perToken=await enforceRateLimitKey('marketing-one-click:'+token.slice(0,32),10,60000);if(perToken){for(const [k,v] of Object.entries(headers))perToken.headers.set(k,v);return perToken;}
 const result=await createAdminClient().rpc('pro_mkt_unsubscribe',{p_token:token,p_confirm:true});
 // Unknown / malformed token → the same answer as a successful one. Only an unavailable database differs.
 if(result.error&&result.error.code!=='P0002'&&result.error.code!=='22023')return new Response('Unavailable',{status:503,headers:{...headers,'Retry-After':'60'}});
 return done();
}
