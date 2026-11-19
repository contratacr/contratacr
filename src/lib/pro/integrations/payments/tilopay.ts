import 'server-only';
import {timedFetch} from '../server';
import type {CardInput,ChargeResult,PaymentProcessor,SignedEvent} from './processor';
import {tilopayConsultVerdict} from './tilopay-consult';

/**
 * Round 6A: SANDBOX/PRODUCTION skeleton for Tilopay (Costa Rica). NOT ACTIVE: built only when the owner
 * selected sandbox/production AND every PRO_TILOPAY_* env var exists. Public docs used
 * (https://tilopay.com/developers/openapi.json, host https://app.tilopay.com for test and live):
 *  POST /api/v1/login {apiuser,password} → access_token (bearer)
 *  POST /api/v1/processPayment {key, amount, currency, orderNumber, redirect, billTo…, capture:1, subscription:0, platform}
 *       → {url} of Tilopay's hosted checkout (card data is typed on Tilopay, never on ContrataCR)
 *  POST /api/v1/consult {key, orderNumber} → state of the order (used to CONFIRM every webhook/redirect,
 *       because the orderHash algorithm is not public: «no ship based on webhook content alone»)
 *  POST /api/v1/processModification {key, orderNumber, type:2 (refund), amount}
 * SINPE Móvil on Tilopay is shown by its checkout/SDK (phone + amount + reference) and confirmed the
 * same way. Field names must be re-checked against the merchant's sandbox before enabling it.
 */
export type TilopayCall={operation:string;url:string;status:number;durationMs:number;outcome:'ok'|'error'|'timeout'};
export class TilopayProcessor implements PaymentProcessor{
 readonly provider='tilopay' as const;
 readonly calls:TilopayCall[]=[];
 private token:{value:string;until:number}|null=null;
 constructor(readonly mode:'sandbox'|'production',private readonly secrets:Record<string,string>,private readonly returnUrl:string){}
 private get base(){return (this.secrets.PRO_TILOPAY_API_URL||'https://app.tilopay.com').replace(/\/$/,'');}
 private secret(name:'API_USER'|'API_PASSWORD'|'API_KEY'){return this.secrets[`PRO_TILOPAY_${this.mode==='production'?'PROD':'SANDBOX'}_${name}`]??'';}
 private async call(operation:string,path:string,body:Record<string,unknown>,auth=true){
  const headers:Record<string,string>={'Content-Type':'application/json',Accept:'application/json'};
  if(auth)headers.Authorization='bearer '+await this.bearer();
  const url=this.base+path,result=await timedFetch(url,{method:'POST',headers,body:JSON.stringify(body)});
  this.calls.push({operation,url,status:result.status,durationMs:result.durationMs,outcome:result.timedOut?'timeout':result.response?.ok?'ok':'error'});
  return {status:result.status,json:result.response?await result.response.json().catch(()=>null) as Record<string,unknown>|null:null};
 }
 private async bearer(){
  if(this.token&&this.token.until>Date.now()+15000)return this.token.value;
  const login=await this.call('login','/api/v1/login',{apiuser:this.secret('API_USER'),password:this.secret('API_PASSWORD')},false);
  const value=typeof login.json?.access_token==='string'?login.json.access_token:'';if(!value)throw Error('tilopay login');
  this.token={value,until:Date.now()+Math.max(60,Number(login.json?.expires_in)||600)*1000};return value;
 }
 /** Tilopay collects the card on ITS hosted page: we return requires_action with the checkout URL as ref target. */
 async chargeCard({attemptId,amountCents,description}:{attemptId:string;amountCents:number;card:CardInput;description:string}):Promise<ChargeResult>{
  const answer=await this.call('processPayment','/api/v1/processPayment',{key:this.secret('API_KEY'),amount:(amountCents/100).toFixed(2),currency:'CRC',orderNumber:attemptId,capture:'1',subscription:'0',platform:'contratacr',
   redirect:this.returnUrl,billToFirstName:'Cliente',billToLastName:'ContrataCR',billToAddress:'Costa Rica',billToAddress2:'',billToCity:'San José',billToState:'SJ',billToZipPostCode:'10101',billToCountry:'CR',billToTelephone:'',billToEmail:'',returnData:description.slice(0,60)});
  return typeof answer.json?.url==='string'?{status:'requires_action',processorRef:attemptId}:{status:'failed',processorRef:attemptId,failureCode:'processor_unavailable'};
 }
 async completeAction({processorRef,amountCents}:{processorRef:string;amountCents:number;approve:boolean}){
  const answer=await this.call('consult','/api/v1/consult',{key:this.secret('API_KEY'),orderNumber:processorRef});
  const verdict=tilopayConsultVerdict(answer.json,{orderNumber:processorRef,amountCents,currency:'CRC'},'not_approved');
  return verdict.ok?{status:'pending' as const}:{status:'failed' as const,failureCode:verdict.failureCode};
 }
 /** Consults the order by the SERVER reference stored with the attempt; approved only with the same amount and currency. */
 async confirmSinpe({processorRef,amountCents,currency}:{processorRef:string;amountCents:number;currency:'CRC';reference:string;code:string}):Promise<ChargeResult>{
  const answer=await this.call('consult','/api/v1/consult',{key:this.secret('API_KEY'),orderNumber:processorRef});
  const verdict=tilopayConsultVerdict(answer.json,{orderNumber:processorRef,amountCents,currency});
  return verdict.ok?{status:'pending',processorRef}:{status:'failed',processorRef,failureCode:verdict.failureCode};
 }
 async refund({processorRef,amountCents}:{processorRef:string;amountCents:number}){
  const answer=await this.call('refund','/api/v1/processModification',{key:this.secret('API_KEY'),orderNumber:processorRef,type:2,amount:(amountCents/100).toFixed(2)});
  return {ok:answer.status===200&&String(answer.json?.type??'')!=='error',message:String(answer.json?.ReasonCodeDescription??answer.status)};
 }
 /** Real events arrive at the webhook route and are confirmed with /consult there. */
 drainEvents():SignedEvent[]{return [];}
}
