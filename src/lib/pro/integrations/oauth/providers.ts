import type {IntegrationMode} from '../registry';

/**
 * Round 6B: OAuth 2.0 endpoints and scopes (public documentation, see registry docs). Google has no separate
 * «sandbox»: the test environment is a Google Cloud app in «Testing» publishing status with test users.
 * Microsoft: an app registration in a developer tenant. Intuit: the app's Development keys + sandbox company.
 */
export type OAuthProvider='google'|'microsoft'|'quickbooks';
export const oauthProviders=['google','microsoft','quickbooks'] as const;
type Endpoints={authorize:string;token:string;revoke:string|null;scopes:string[];extra:Record<string,string>};
export function oauthEndpoints(provider:OAuthProvider,mode:Exclude<IntegrationMode,'mock'>,secrets:Record<string,string>):Endpoints{
 if(provider==='google')return {
  authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',revoke:'https://oauth2.googleapis.com/revoke',
  // drive.file + Google Picker: only files the owner picks (avoids the restricted drive.readonly scope).
  scopes:['openid','email','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/drive.file'],
  extra:{access_type:'offline',prompt:'consent',include_granted_scopes:'true'},
 };
 if(provider==='microsoft'){
  const tenant=secrets.PRO_MICROSOFT_OAUTH_TENANT||'common';
  return {authorize:`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,token:`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,revoke:null,
   scopes:['openid','email','offline_access','Mail.Send','Mail.Read','Calendars.ReadWrite','Files.Read'],extra:{response_mode:'query'}};
 }
 return {authorize:'https://appcenter.intuit.com/connect/oauth2',token:'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',revoke:'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
  scopes:['com.intuit.quickbooks.accounting','openid','email'],extra:{}};
}
export function oauthClient(provider:OAuthProvider,mode:Exclude<IntegrationMode,'mock'>,secrets:Record<string,string>){
 const prefix=provider==='google'?'PRO_GOOGLE_OAUTH_':provider==='microsoft'?'PRO_MICROSOFT_OAUTH_':'PRO_QUICKBOOKS_',tag=mode==='sandbox'?'SANDBOX_':'PROD_';
 return {clientId:secrets[prefix+tag+'CLIENT_ID']!,clientSecret:secrets[prefix+tag+'CLIENT_SECRET']!};
}
/** QuickBooks API base per mode (sandbox companies live on a different host). */
export const quickbooksApiBase=(mode:Exclude<IntegrationMode,'mock'>)=>mode==='sandbox'?'https://sandbox-quickbooks.api.intuit.com':'https://quickbooks.api.intuit.com';
export const mockScopes:Record<OAuthProvider,string[]>={google:['email','gmail.send','calendar.events','drive.file'],microsoft:['email','Mail.Send','Mail.Read','Calendars.ReadWrite','Files.Read'],quickbooks:['com.intuit.quickbooks.accounting']};
