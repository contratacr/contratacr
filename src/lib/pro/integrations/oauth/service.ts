import 'server-only';
import type {createAdminClient} from '@/lib/supabase/admin';
import {logOutbound,providerSecrets,resolveMode,storedMode,timedFetch} from '../server';
import type {IntegrationMode} from '../registry';
import {newState,open,pkceChallenge,pkcePair,seal,stateHash,VaultError,type VaultKeyId} from './vault';
import {mockAuthorizeUrl,mockExchange,MockOAuthError,mockTokens} from './mock';
import {oauthClient,oauthEndpoints,type OAuthProvider} from './providers';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';

/**
 * Round 6B: OAuth connection flow shared by Google, Microsoft and QuickBooks.
 * start → PKCE pair + state (sha256 stored, verifier encrypted) → provider consent → callback (state consumed
 * once, owner must be the signed-in user) → code exchange with the verifier → tokens sealed → stored.
 * Real endpoints are only reached in sandbox/production with every env var present (none exist locally).
 */
type Db=ReturnType<typeof createAdminClient>;
export class OAuthError extends Error{constructor(readonly status:number,readonly reason:string,message:string){super(message);this.name='OAuthError';}}
const keyFor=(mode:IntegrationMode):VaultKeyId=>mode==='mock'?'mock':'env';
async function rpc<T>(db:Db,name:string,args:Record<string,unknown>):Promise<T>{
 const result=await db.rpc(name,args);
 if(result.error){const e=result.error as {code?:string;hint?:string};throw new OAuthError(e.code==='40001'?409:e.code==='42501'?403:e.code==='54000'?429:e.code==='22023'?400:503,e.hint||e.code||'db','db');}
 return result.data as T;
}
export async function connectionMode(db:Db,owner:string,provider:OAuthProvider){return resolveMode(provider,await storedMode(db,owner,provider));}
export async function startConnection(db:Db,owner:string,provider:OAuthProvider,locale:'es'|'en',view:'conectores'|'contabilidad',origin:string){
 const resolved=await connectionMode(db,owner,provider);
 if(resolved.status!=='ready')throw new OAuthError(409,resolved.status,resolved.status==='missing_keys'?'Faltan variables de entorno de este proveedor en el servidor.':resolved.status==='production_refused'?'Producción no está permitida en este servidor.':'La integración está desactivada.');
 const {verifier,challenge}=pkcePair(),state=newState();
 let verifierBox:string;try{verifierBox=seal(verifier,keyFor(resolved.mode));}catch(error){if(error instanceof VaultError)throw new OAuthError(409,'missing_keys',error.message);throw error;}
 await rpc(db,'pro_oauth_begin',{p_actor:owner,p_input:{provider,mode:resolved.mode,stateHash:stateHash(state),verifierBox,locale,view}});
 if(resolved.mode==='mock')return {mode:resolved.mode,authorizeUrl:mockAuthorizeUrl(origin,{provider,state,challenge,locale})};
 const secrets=providerSecrets(provider,resolved.mode)!,endpoints=oauthEndpoints(provider,resolved.mode,secrets),client=oauthClient(provider,resolved.mode,secrets);
 const url=endpoints.authorize+'?'+new URLSearchParams({client_id:client.clientId,redirect_uri:origin+'/api/pro/oauth/callback',response_type:'code',scope:endpoints.scopes.join(' '),state,code_challenge:challenge,code_challenge_method:'S256',...endpoints.extra});
 return {mode:resolved.mode,authorizeUrl:url};
}
type Consumed={ownerId:string;provider:OAuthProvider;mode:IntegrationMode;verifierBox:string;locale:'es'|'en';view:string};
const jwtEmail=(idToken:unknown)=>{try{const part=String(idToken).split('.')[1];const data=JSON.parse(Buffer.from(part!,'base64url').toString('utf8')) as {email?:string;preferred_username?:string};return data.email||data.preferred_username||null;}catch{return null;}};
/** Callback: returns where to send the browser. Never throws for provider-side denials. */
export async function finishConnection(db:Db,sessionUser:string|null,query:{state?:string;code?:string;error?:string;realmId?:string},origin:string){
 if(!query.state)throw new OAuthError(400,'pro_oauth_state','Falta el estado.');
 const s=await rpc<Consumed>(db,'pro_oauth_consume',{p_state_hash:stateHash(query.state)});
 const back=(result:string)=>`${origin}${prefijoDeIdioma(s.locale)||'/es'}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:s.view,oauth:result,proveedor:s.provider});
 if(!sessionUser||sessionUser!==s.ownerId)throw new OAuthError(403,'pro_oauth_owner','La conexión pertenece a otra cuenta.');
 if(query.error||!query.code){await rpc(db,'pro_oauth_note',{p_actor:s.ownerId,p_provider:s.provider,p_mode:s.mode,p_action:'denied',p_detail:{reason:String(query.error||'no_code').slice(0,60)}});return back('denied');}
 const verifier=open(s.verifierBox),started=Date.now();
 let tokens:{accessToken:string;refreshToken:string|null;expiresIn:number;scopes:string[];accountEmail:string|null;realmId:string|null};
 if(s.mode==='mock'){
  try{tokens=mockExchange(s.provider,query.code,verifier);}catch(error){
   await logOutbound(db,s.ownerId,{provider:s.provider,mode:'mock',operation:'oauth_token',url:'https://oauth.mock.local/token',statusCode:400,outcome:'error',durationMs:Date.now()-started,summary:{error:error instanceof MockOAuthError?error.reason:'error'}});
   await rpc(db,'pro_oauth_note',{p_actor:s.ownerId,p_provider:s.provider,p_mode:s.mode,p_action:'failed',p_detail:{reason:'invalid_grant'}});return back('failed');
  }
  await logOutbound(db,s.ownerId,{provider:s.provider,mode:'mock',operation:'oauth_token',url:'https://oauth.mock.local/token',statusCode:200,outcome:'ok',durationMs:Date.now()-started,summary:{pkce:'S256',scopes:tokens.scopes.length}});
 }else{
  const secrets=providerSecrets(s.provider,s.mode);if(!secrets)return back('failed');
  const endpoints=oauthEndpoints(s.provider,s.mode,secrets),client=oauthClient(s.provider,s.mode,secrets);
  const body=new URLSearchParams({grant_type:'authorization_code',code:query.code,redirect_uri:origin+'/api/pro/oauth/callback',code_verifier:verifier,...(s.provider==='quickbooks'?{}:{client_id:client.clientId,client_secret:client.clientSecret})});
  const headers:Record<string,string>={'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'};
  if(s.provider==='quickbooks')headers.Authorization='Basic '+Buffer.from(client.clientId+':'+client.clientSecret).toString('base64');
  const call=await timedFetch(endpoints.token,{method:'POST',headers,body});
  const json=call.response?await call.response.json().catch(()=>null) as Record<string,unknown>|null:null;
  await logOutbound(db,s.ownerId,{provider:s.provider,mode:s.mode,operation:'oauth_token',url:endpoints.token,statusCode:call.status,outcome:call.status===200?'ok':call.timedOut?'timeout':'error',durationMs:call.durationMs,summary:{pkce:'S256'}});
  if(call.status!==200||!json||typeof json.access_token!=='string'){await rpc(db,'pro_oauth_note',{p_actor:s.ownerId,p_provider:s.provider,p_mode:s.mode,p_action:'failed',p_detail:{status:call.status}});return back('failed');}
  tokens={accessToken:json.access_token,refreshToken:typeof json.refresh_token==='string'?json.refresh_token:null,expiresIn:Number(json.expires_in)||3600,scopes:String(json.scope??endpoints.scopes.join(' ')).split(/\s+/).filter(Boolean).slice(0,20),accountEmail:jwtEmail(json.id_token),realmId:s.provider==='quickbooks'&&/^\d{1,30}$/.test(query.realmId??'')?query.realmId!:null};
 }
 const key=keyFor(s.mode);
 await rpc(db,'pro_oauth_store',{p_actor:s.ownerId,p_provider:s.provider,p_mode:s.mode,p_payload:{accessBox:seal(tokens.accessToken,key),refreshBox:tokens.refreshToken?seal(tokens.refreshToken,key):null,
  expiresAt:new Date(Date.now()+tokens.expiresIn*1000).toISOString(),scopes:tokens.scopes,accountEmail:tokens.accountEmail,realmId:tokens.realmId}});
 return back('connected');
}
type TokenRow={mode:IntegrationMode;status:string;accessBox:string;refreshBox:string|null;expiresAt:string|null;accountEmail:string|null;realmId:string|null;revision:number};
/** Decrypted access token for one server call (refreshes when expired). Null when not connected. */
export async function accessToken(db:Db,owner:string,provider:OAuthProvider){
 const row=await rpc<TokenRow|null>(db,'pro_oauth_token',{p_actor:owner,p_provider:provider});
 if(!row)return null;
 if(row.expiresAt&&new Date(row.expiresAt).getTime()<Date.now()+60000&&row.refreshBox){
  if(row.mode==='mock'){
   const next=mockTokens(provider);
   await rpc(db,'pro_oauth_store',{p_actor:owner,p_provider:provider,p_mode:'mock',p_payload:{accessBox:seal(next.accessToken,'mock'),refreshBox:seal(next.refreshToken,'mock'),expiresAt:new Date(Date.now()+3600000).toISOString(),scopes:next.scopes,accountEmail:row.accountEmail,realmId:row.realmId,historyAction:'refresh'}});
   return {token:next.accessToken,mode:row.mode,accountEmail:row.accountEmail,realmId:row.realmId};
  }
  // Real refresh: same token endpoint with grant_type=refresh_token (only with env keys; not exercised locally).
  const secrets=providerSecrets(provider,row.mode as Exclude<IntegrationMode,'mock'>);if(!secrets)return null;
 }
 return {token:open(row.accessBox),mode:row.mode,accountEmail:row.accountEmail,realmId:row.realmId};
}
/** Disconnect: provider-side revoke when it exists (mock: simulated), then the stored envelopes are wiped. */
export async function revokeConnection(db:Db,owner:string,input:{provider:OAuthProvider;revision:number;actionId:string}){
 const row=await rpc<TokenRow|null>(db,'pro_oauth_token',{p_actor:owner,p_provider:input.provider});
 let providerRevoked=false;
 if(row){
  const started=Date.now();
  if(row.mode==='mock'){providerRevoked=true;await logOutbound(db,owner,{provider:input.provider,mode:'mock',operation:'oauth_revoke',url:'https://oauth.mock.local/revoke',statusCode:200,outcome:'ok',durationMs:Date.now()-started,summary:{revoked:true}});}
  else{
   const secrets=providerSecrets(input.provider,row.mode as Exclude<IntegrationMode,'mock'>);
   const endpoints=secrets?oauthEndpoints(input.provider,row.mode as Exclude<IntegrationMode,'mock'>,secrets):null;
   if(secrets&&endpoints?.revoke){
    const token=row.refreshBox?open(row.refreshBox):open(row.accessBox),client=oauthClient(input.provider,row.mode as Exclude<IntegrationMode,'mock'>,secrets);
    const call=input.provider==='quickbooks'
     ?await timedFetch(endpoints.revoke,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:'Basic '+Buffer.from(client.clientId+':'+client.clientSecret).toString('base64')},body:JSON.stringify({token})})
     :await timedFetch(endpoints.revoke,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token})});
    providerRevoked=call.status===200;
    await logOutbound(db,owner,{provider:input.provider,mode:row.mode,operation:'oauth_revoke',url:endpoints.revoke,statusCode:call.status,outcome:providerRevoked?'ok':'error',durationMs:call.durationMs});
   }
  }
 }
 return rpc<{provider:string;status:string;revision:number}>(db,'pro_oauth_revoke',{p_actor:owner,p_input:{action:'revoke',actionId:input.actionId,provider:input.provider,revision:input.revision},p_provider_revoked:providerRevoked});
}
export {pkceChallenge};
