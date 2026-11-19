import 'server-only';
import {createSign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {timedFetch} from '../server';

/**
 * Round 6B: DocuSign eSignature REST API v2.1 adapter (developer sandbox «demo»; production after go-live
 * review). NOT ACTIVE: it is constructed only when every PRO_DOCUSIGN_SANDBOX_* variable exists (none do).
 * Auth: JWT grant (RS256, scope «signature impersonation»; the user must grant consent once).
 * Status: DocuSign Connect webhook (JSON, restv2.1) with HMAC-SHA256 of the raw body, base64, in
 * X-DocuSign-Signature-1. On «envelope-completed» we download the combined signed PDF and the
 * certificate of completion and store both immutably.
 * Why DocuSign: public sandbox + documented webhooks/HMAC + available to Costa Rican accounts. It provides an
 * electronic signature with an audit trail; it is NOT the «firma digital certificada» of Ley 8454 (see guide).
 */
export type DocusignSecrets=Record<string,string>;
export type DocusignCall={operation:string;url:string;status:number;outcome:'ok'|'error'|'timeout';durationMs:number};
export class DocusignClient{
 calls:DocusignCall[]=[];
 private token:string|null=null;
 constructor(readonly mode:'sandbox'|'production',private secrets:DocusignSecrets){}
 private v(name:string){return this.secrets[`PRO_DOCUSIGN_${this.mode==='sandbox'?'SANDBOX':'PROD'}_${name}`]??'';}
 private get oauthHost(){return this.mode==='sandbox'?'account-d.docusign.com':'account.docusign.com';}
 private get base(){return (this.v('BASE_URL')||'https://demo.docusign.net')+'/restapi/v2.1/accounts/'+encodeURIComponent(this.v('ACCOUNT_ID'));}
 private async auth(){
  if(this.token)return this.token;
  const now=Math.floor(Date.now()/1000),enc=(o:unknown)=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:this.v('INTEGRATION_KEY'),sub:this.v('USER_ID'),aud:this.oauthHost,iat:now,exp:now+3000,scope:'signature impersonation'});
  const signature=createSign('RSA-SHA256').update(unsigned).sign(readFileSync(this.v('PRIVATE_KEY_PATH'),'utf8')).toString('base64url');
  const url=`https://${this.oauthHost}/oauth/token`;
  const call=await timedFetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature})});
  this.calls.push({operation:'oauth_jwt',url,status:call.status,outcome:call.status===200?'ok':call.timedOut?'timeout':'error',durationMs:call.durationMs});
  const json=call.status===200?await call.response!.json() as {access_token?:string}:null;
  if(!json?.access_token)throw Error('docusign auth');return this.token=json.access_token;
 }
 private async api(operation:string,path:string,init:RequestInit={}){
  const url=this.base+path,call=await timedFetch(url,{...init,headers:{Authorization:'Bearer '+await this.auth(),'Content-Type':'application/json',Accept:'application/json, application/pdf'}},30000);
  this.calls.push({operation,url,status:call.status,outcome:call.status>=200&&call.status<300?'ok':call.timedOut?'timeout':'error',durationMs:call.durationMs});
  if(!call.response||call.status>=300)throw Error('docusign '+operation+' '+call.status);return call.response;
 }
 async send(input:{pdf:Buffer;name:string;subject:string;signerName:string;signerEmail:string;expiryDays:number;reminderDays:number;webhookUrl:string;requestId:string}){
  const body={emailSubject:input.subject.slice(0,100),status:'sent',documents:[{documentBase64:input.pdf.toString('base64'),name:input.name.slice(0,100),fileExtension:'pdf',documentId:'1'}],
   recipients:{signers:[{email:input.signerEmail,name:input.signerName,recipientId:'1',routingOrder:'1',tabs:{signHereTabs:[{anchorString:'/firma1/',anchorUnits:'pixels',anchorYOffset:'-10'}]}}]},
   notification:{useAccountDefaults:'false',expirations:{expireEnabled:'true',expireAfter:String(input.expiryDays),expireWarn:'2'},reminders:{reminderEnabled:input.reminderDays>0?'true':'false',reminderDelay:String(Math.max(1,input.reminderDays)),reminderFrequency:String(Math.max(1,input.reminderDays))}},
   customFields:{textCustomFields:[{name:'ccrRequestId',value:input.requestId,show:'false'}]},
   eventNotification:{url:input.webhookUrl,requireAcknowledgment:'true',includeHMAC:'true',includeDocuments:'false',loggingEnabled:'true',
    events:['envelope-sent','envelope-delivered','envelope-completed','envelope-declined','envelope-voided'],eventData:{version:'restv2.1',format:'json'}}};
  const json=await (await this.api('envelope_create','/envelopes',{method:'POST',body:JSON.stringify(body)})).json() as {envelopeId:string};
  return {envelopeId:json.envelopeId};
 }
 async void(envelopeId:string,reason:string){await this.api('envelope_void',`/envelopes/${encodeURIComponent(envelopeId)}`,{method:'PUT',body:JSON.stringify({status:'voided',voidedReason:reason.slice(0,200)})});}
 async documents(envelopeId:string){
  const pdf=Buffer.from(await (await this.api('documents_combined',`/envelopes/${encodeURIComponent(envelopeId)}/documents/combined`)).arrayBuffer());
  const certificate=Buffer.from(await (await this.api('documents_certificate',`/envelopes/${encodeURIComponent(envelopeId)}/documents/certificate`)).arrayBuffer());
  return {pdf,certificate};
 }
}
export {connectStatus,verifyConnectHmac} from './connect';
