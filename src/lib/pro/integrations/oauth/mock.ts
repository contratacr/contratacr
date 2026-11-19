import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {pkceChallenge} from './vault';
import {mockScopes,type OAuthProvider} from './providers';

/**
 * Round 6B: local MOCK authorization server (Google, Microsoft and Intuit look-alike). Deterministic, no
 * network. The authorization code is self-contained (provider, PKCE challenge, expiry) and HMAC-signed with a
 * PUBLIC local test value: it can only be exchanged by presenting the PKCE verifier whose S256 hash it carries.
 * Tokens it issues are random strings that open nothing outside this mock.
 */
const MOCK_CODE_KEY='ccr-local-mock-oauth-code-v1';
export const MOCK_ACCOUNT:Record<OAuthProvider,string>={google:'propietario.demo@gmail.mock',microsoft:'propietario.demo@outlook.mock',quickbooks:'propietario.demo@intuit.mock'};
export const MOCK_REALM='9130350000000001';
const sign=(payload:string)=>createHmac('sha256',MOCK_CODE_KEY).update(payload).digest('base64url');
export function mockAuthorizeUrl(origin:string,input:{provider:OAuthProvider;state:string;challenge:string;locale:'es'|'en'}){
 return `${origin}/api/pro/oauth/mock-authorize?`+new URLSearchParams({provider:input.provider,client_id:'mock-'+input.provider,redirect_uri:origin+'/api/pro/oauth/callback',response_type:'code',
  state:input.state,code_challenge:input.challenge,code_challenge_method:'S256',scope:mockScopes[input.provider].join(' '),hl:input.locale});
}
export function mockIssueCode(provider:OAuthProvider,challenge:string,now=Date.now()){
 const payload=Buffer.from(JSON.stringify({p:provider,c:challenge,e:now+5*60000,n:randomBytes(6).toString('hex')})).toString('base64url');
 return payload+'.'+sign(payload);
}
export type MockTokens={accessToken:string;refreshToken:string;expiresIn:number;scopes:string[];accountEmail:string;realmId:string|null};
export class MockOAuthError extends Error{constructor(readonly reason:'invalid_grant'|'invalid_request'){super(reason);this.name='MockOAuthError';}}
export function mockExchange(provider:OAuthProvider,code:string,verifier:string,now=Date.now()):MockTokens{
 const [payload,mac]=code.split('.');
 if(!payload||!mac)throw new MockOAuthError('invalid_request');
 const expected=Buffer.from(sign(payload)),given=Buffer.from(mac);
 if(expected.length!==given.length||!timingSafeEqual(expected,given))throw new MockOAuthError('invalid_grant');
 const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as {p:string;c:string;e:number};
 if(data.p!==provider||data.e<now||pkceChallenge(verifier)!==data.c)throw new MockOAuthError('invalid_grant');
 return mockTokens(provider);
}
export const mockTokens=(provider:OAuthProvider):MockTokens=>({accessToken:'mock-at-'+randomBytes(18).toString('base64url'),refreshToken:'mock-rt-'+randomBytes(18).toString('base64url'),expiresIn:3600,scopes:mockScopes[provider],accountEmail:MOCK_ACCOUNT[provider],realmId:provider==='quickbooks'?MOCK_REALM:null});
const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
/** Consent screen of the mock (plain HTML; links only, no script). */
export function mockConsentHtml(input:{provider:OAuthProvider;allow:string;deny:string;scopes:string[];en:boolean}){
 const name={google:'Google',microsoft:'Microsoft',quickbooks:'Intuit QuickBooks'}[input.provider],t=(es:string,en:string)=>input.en?en:es;
 return `<!doctype html><html lang="${input.en?'en':'es'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)} · ${t('Simulación','Simulation')}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f3f6f9;color:#162543}main{max-width:520px;margin:24px auto;background:#fff;border:1px solid #d7e1ea;border-radius:16px;padding:20px}
.b{display:inline-flex;min-height:44px;align-items:center;padding:0 20px;border-radius:999px;text-decoration:none;font-weight:700;margin:6px 8px 0 0}.y{background:#008bb5;color:#fff}.n{border:1px solid #d7e1ea;color:#162543}
.w{background:#fff6e0;border-radius:12px;padding:10px;font-size:14px}li{word-break:break-all}</style></head><body><main data-mock-consent="${input.provider}">
<p class="w">${t('SIMULACIÓN LOCAL: esta pantalla imita el permiso de','LOCAL SIMULATION: this screen imitates the consent screen of')} ${esc(name)}. ${t('No se contacta a ningún proveedor.','No provider is contacted.')}</p>
<h1 style="font-size:20px">${t('ContrataCR Pro quiere acceder a su cuenta','ContrataCR Pro wants to access your account')}</h1><p>${esc(MOCK_ACCOUNT[input.provider])}</p>
<ul>${input.scopes.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>
<a class="b y" data-mock-allow href="${esc(input.allow)}">${t('Permitir','Allow')}</a><a class="b n" data-mock-deny href="${esc(input.deny)}">${t('Cancelar','Cancel')}</a></main></body></html>`;
}
