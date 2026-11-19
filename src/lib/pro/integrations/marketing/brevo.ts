/**
 * Round 6D (row 71): email delivery adapter for professionals' campaigns. INACTIVE: only used when the
 * marketing_email provider is in sandbox/production mode with PRO_MARKETING_BREVO_*_API_KEY (none exists).
 * Separate from ContrataCR's own transactional email (src/lib/email): a different key, sender and account so a
 * professional's campaign can never affect ContrataCR's reputation or lists. `fetch` is injectable (tests: no network).
 * Docs: https://developers.brevo.com/reference/sendtransacemail
 */
import {oneClickUnsubscribeUrl} from './unsubscribe-links';
const unsubscribeHeaders=(pageUrl:string):Record<string,string>=>{const oneClick=oneClickUnsubscribeUrl(pageUrl);return oneClick?{'List-Unsubscribe':`<${oneClick}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}:{'List-Unsubscribe':`<${pageUrl}>`};};
export type CampaignEmail={to:string;subject:string;text:string;unsubscribeUrl:string;sender:{name:string;email:string};tags:string[]};
export type SendOutcome={ok:true;providerId:string}|{ok:false;status:number;retryable:boolean};
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
export class BrevoCampaignSender{
 constructor(private apiKey:string,private fetcher:Fetcher=fetch,private baseUrl='https://api.brevo.com'){}
 request(mail:CampaignEmail){
  return {url:this.baseUrl.replace(/\/$/,'')+'/v3/smtp/email',init:{method:'POST',headers:{'api-key':this.apiKey,'content-type':'application/json',accept:'application/json'},
   body:JSON.stringify({sender:mail.sender,to:[{email:mail.to}],subject:mail.subject,textContent:mail.text,tags:mail.tags.slice(0,10),
    // RFC 8058 one-click unsubscribe (required by large mailbox providers for bulk mail): the header points at the
    // POST endpoint with the token in the QUERY (a #fragment is never sent). Without a valid token no Post header.
    headers:unsubscribeHeaders(mail.unsubscribeUrl)})} satisfies RequestInit};
 }
 async send(mail:CampaignEmail):Promise<SendOutcome>{
  const {url,init}=this.request(mail);
  try{const response=await this.fetcher(url,init);if(response.ok){const body=await response.json().catch(()=>({})) as {messageId?:string};return {ok:true,providerId:String(body.messageId??'')};}
   return {ok:false,status:response.status,retryable:response.status===429||response.status>=500};}
  catch{return {ok:false,status:0,retryable:true};}
 }
}
