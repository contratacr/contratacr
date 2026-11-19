import 'server-only';
import {timedFetch} from '../server';
import type {AtvClient,AtvState,AtvSubmission,AtvSubmitResult} from './atv';

/**
 * Round 6A: REAL ATV client (sandbox / production). Constructed only by the e-invoice service when
 * every env var of the mode exists; never in mock mode. OAuth2 «password» grant on Hacienda's IdP
 * (token lives 5 minutes, kept in memory only). Endpoints from Anexo 3 v4.4; the sandbox realm/client
 * defaults can be overridden with PRO_HACIENDA_SANDBOX_TOKEN_URL / _CLIENT_ID / _API_URL.
 */
const ENDPOINTS={
 sandbox:{token:'https://idp.comprobanteselectronicos.go.cr/auth/realms/rut-stag/protocol/openid-connect/token',client:'api-stag',api:'https://api.comprobanteselectronicos.go.cr/recepcion-sandbox/v1/'},
 production:{token:'https://idp.comprobanteselectronicos.go.cr/auth/realms/rut/protocol/openid-connect/token',client:'api-prod',api:'https://api.comprobanteselectronicos.go.cr/recepcion/v1/'},
};
export type AtvCall={operation:string;url:string;status:number;durationMs:number;outcome:'ok'|'error'|'timeout'};
export class RemoteAtv implements AtvClient{
 private token:{value:string;until:number}|null=null;
 readonly calls:AtvCall[]=[];
 constructor(readonly mode:'sandbox'|'production',private readonly secrets:Record<string,string>){}
 private get endpoints(){
  const base=ENDPOINTS[this.mode];
  if(this.mode==='production')return base;
  return {token:this.secrets.PRO_HACIENDA_SANDBOX_TOKEN_URL||base.token,client:this.secrets.PRO_HACIENDA_SANDBOX_CLIENT_ID||base.client,api:this.secrets.PRO_HACIENDA_SANDBOX_API_URL||base.api};
 }
 private credential(name:'USERNAME'|'PASSWORD'){return this.secrets[`PRO_HACIENDA_${this.mode==='production'?'PROD':'SANDBOX'}_${name}`]??'';}
 private async bearer(){
  if(this.token&&this.token.until>Date.now()+15000)return this.token.value;
  const body=new URLSearchParams({grant_type:'password',client_id:this.endpoints.client,username:this.credential('USERNAME'),password:this.credential('PASSWORD')});
  const call=await timedFetch(this.endpoints.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  this.calls.push({operation:'token',url:this.endpoints.token,status:call.status,durationMs:call.durationMs,outcome:call.timedOut?'timeout':call.response?.ok?'ok':'error'});
  if(!call.response?.ok)throw Error(`token ${call.status}`);
  const json=await call.response.json() as {access_token?:string;expires_in?:number};
  if(!json.access_token)throw Error('token');
  this.token={value:json.access_token,until:Date.now()+Math.max(30,json.expires_in??300)*1000};return this.token.value;
 }
 async submit(input:AtvSubmission):Promise<AtvSubmitResult>{
  let bearer:string;try{bearer=await this.bearer();}catch{return {outcome:'error',status:0,message:'No se pudo autenticar con Hacienda.',transient:true};}
  const url=this.endpoints.api+'recepcion';
  const call=await timedFetch(url,{method:'POST',headers:{Authorization:'bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify({clave:input.clave,fecha:input.issuedAt,
   emisor:{tipoIdentificacion:input.emisor.type,numeroIdentificacion:input.emisor.number},...(input.receptor?{receptor:{tipoIdentificacion:input.receptor.type,numeroIdentificacion:input.receptor.number}}:{}),
   comprobanteXml:Buffer.from(input.signedXml,'utf8').toString('base64')})});
  this.calls.push({operation:'recepcion',url,status:call.status,durationMs:call.durationMs,outcome:call.timedOut?'timeout':call.status===201||call.status===202?'ok':'error'});
  if(call.status===201||call.status===202)return {outcome:'sent',status:call.status,message:'Recibido por Hacienda.'};
  const cause=call.response?.headers.get('x-error-cause')??'';
  // A clave already received is not an error for us: ask for its state.
  if(call.status===400&&/ya fue recibid|already/i.test(cause))return {outcome:'sent',status:call.status,message:'Hacienda ya tenía este comprobante.'};
  return {outcome:'error',status:call.status,message:(cause||`Hacienda respondió ${call.status}`).slice(0,300),transient:call.status===0||call.status===429||call.status>=500};
 }
 async status(input:AtvSubmission):Promise<AtvState>{
  let bearer:string;try{bearer=await this.bearer();}catch{return {state:'error',status:0,message:'No se pudo autenticar con Hacienda.'};}
  const url=this.endpoints.api+'recepcion/'+input.clave;
  const call=await timedFetch(url,{method:'GET',headers:{Authorization:'bearer '+bearer}});
  this.calls.push({operation:'estado',url,status:call.status,durationMs:call.durationMs,outcome:call.timedOut?'timeout':call.response?.ok?'ok':'error'});
  if(!call.response?.ok)return {state:call.status===404?'recibido':'error',status:call.status,message:`Hacienda respondió ${call.status}`};
  const json=await call.response.json() as Record<string,unknown>;
  const state=String(json['ind-estado']??'').toLowerCase(),xmlB64=typeof json['respuesta-xml']==='string'?json['respuesta-xml']:'';
  const responseXml=xmlB64?Buffer.from(xmlB64,'base64').toString('utf8'):undefined;
  const code=responseXml?Number(/<Mensaje>(\d)<\/Mensaje>/.exec(responseXml)?.[1]??0):0;
  const detail=responseXml?(/<DetalleMensaje>([\s\S]*?)<\/DetalleMensaje>/.exec(responseXml)?.[1]??''):'';
  if(state==='aceptado'||state==='rechazado')return {state,status:call.status,responseXml,responseCode:(code===1||code===2||code===3?code:state==='aceptado'?1:3) as 1|2|3,message:detail.slice(0,2000)||state};
  return {state:state==='procesando'?'procesando':state==='error'?'error':'recibido',status:call.status,message:state||'recibido'};
 }
}
