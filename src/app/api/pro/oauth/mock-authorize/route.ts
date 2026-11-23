import {z} from 'zod';
import {proRequestOrigin} from '@/lib/pro/route-common';
import {mockConsentHtml,mockIssueCode,MOCK_REALM} from '@/lib/pro/integrations/oauth/mock';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6B: consent screen of the LOCAL MOCK authorization server (development only). It only redirects to
// our own callback (redirect_uri must be exactly this origin's /api/pro/oauth/callback) and never contacts a
// provider. Requires PKCE S256.
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const query=z.object({provider:z.enum(['google','microsoft','quickbooks']),client_id:z.string().max(60),redirect_uri:z.string().url().max(300),response_type:z.literal('code'),
 state:z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),code_challenge:z.string().regex(/^[A-Za-z0-9_-]{43}$/),code_challenge_method:z.literal('S256'),scope:z.string().max(500),hl:z.enum(['es','en'])}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const url=new URL(req.url),raw:Record<string,string>={};for(const [k,v] of url.searchParams){if(k in raw)return new Response('Consulta inválida',{status:400,headers});raw[k]=v;}
 const parsed=query.safeParse(raw);if(!parsed.success)return new Response('Consulta inválida',{status:400,headers});
 const q=parsed.data,callback=proRequestOrigin(req)+'/api/pro/oauth/callback';
 if(q.redirect_uri!==callback||q.client_id!=='mock-'+q.provider)return new Response('redirect_uri no permitido',{status:400,headers});
 const code=mockIssueCode(q.provider,q.code_challenge);
 const allow=callback+'?'+new URLSearchParams({code,state:q.state,...(q.provider==='quickbooks'?{realmId:MOCK_REALM}:{})});
 const deny=callback+'?'+new URLSearchParams({error:'access_denied',state:q.state});
 return new Response(mockConsentHtml({provider:q.provider,allow,deny,scopes:q.scope.split(' ').filter(Boolean),en:q.hl==='en'}),{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
