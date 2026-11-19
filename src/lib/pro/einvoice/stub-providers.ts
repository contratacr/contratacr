import {EINVOICE_ENV,EinvoiceProviderRefused,resolveEinvoiceProvider,type DocumentSubmission,type EinvoiceEnv,type EinvoiceProvider,type EinvoiceProviderMode,type IssueResult,type ReceiverSubmission,type StatusResult} from './provider';

/**
 * Ronda F2-A: real providers as GUARDED stubs. Both refuse (EinvoiceProviderRefused) unless the server env selects
 * them and every required variable exists (presence only — values are never read here). Today no such env exists,
 * so nothing can reach Hacienda or GTI from this code.
 *  * HaciendaSandboxProvider: when fully configured, delegates FE/TE/ND/NC to the Round 6A ATV client
 *    (integrations/hacienda/atv-remote.ts, loaded lazily, server only). MensajeReceptor over ATV is not wired yet
 *    (needs consecutivoReceptor in the POST body): refuses with not_implemented.
 *  * GtiProvider: GTI's API contract is not available to us; every call refuses with not_implemented even when the
 *    env exists, until the owner provides the contract, keys and explicit OK.
 */
function guard(id:'hacienda-sandbox'|'gti',mode:EinvoiceProviderMode,env:EinvoiceEnv){
 const resolved=resolveEinvoiceProvider(env);
 if(resolved.id!==id)throw new EinvoiceProviderRefused(id,'not_configured',[EINVOICE_ENV.selector]);
 if(mode==='live'&&resolved.mode!=='live')throw new EinvoiceProviderRefused(id,'live_not_allowed',[EINVOICE_ENV.mode,EINVOICE_ENV.liveConfirmed]);
 if(resolved.status!=='ready')throw new EinvoiceProviderRefused(id,resolved.reason==='live_not_allowed'?'live_not_allowed':'not_configured',resolved.missing);
 return resolved;
}
export class HaciendaSandboxProvider implements EinvoiceProvider{
 readonly id='hacienda-sandbox' as const;
 constructor(readonly mode:Exclude<EinvoiceProviderMode,'mock'>='sandbox',private readonly env:EinvoiceEnv=process.env){}
 private async atv(){
  guard(this.id,this.mode,this.env);
  const secrets:Record<string,string>={};
  for(const name of [...EINVOICE_ENV['hacienda-sandbox'][this.mode==='live'?'live':'sandbox'],'PRO_HACIENDA_SANDBOX_TOKEN_URL','PRO_HACIENDA_SANDBOX_CLIENT_ID','PRO_HACIENDA_SANDBOX_API_URL'])if(this.env[name])secrets[name]=this.env[name]!.trim();
  const {RemoteAtv}=await import('../integrations/hacienda/atv-remote');
  return new RemoteAtv(this.mode==='live'?'production':'sandbox',secrets);
 }
 private submission(input:DocumentSubmission){return {clave:input.clave,issuedAt:input.issuedAt,emisor:input.emisor,receptor:input.receptor,signedXml:input.signedXml,totalComprobante:input.totalComprobante,totalImpuesto:input.totalImpuesto,attempt:input.attempt};}
 async issue(input:DocumentSubmission):Promise<IssueResult>{
  const out=await (await this.atv()).submit(this.submission(input));
  return out.outcome==='sent'?{outcome:out.status===400?'duplicate':'received',httpStatus:out.status,message:out.message,transient:false,timedOut:false}
   :{outcome:'error',httpStatus:out.status,message:out.message,transient:out.transient,timedOut:out.status===0};
 }
 async cancel(input:DocumentSubmission){return this.issue(input);}
 async getStatus(input:DocumentSubmission):Promise<StatusResult>{
  const out=await (await this.atv()).status(this.submission(input));
  return {state:out.state,httpStatus:out.status,message:out.message,responseXml:out.responseXml,responseCode:out.responseCode,reasons:out.state==='rechazado'?[out.message]:[]};
 }
 async receiverMessage(input:ReceiverSubmission):Promise<IssueResult>{void input;guard(this.id,this.mode,this.env);throw new EinvoiceProviderRefused(this.id,'not_implemented');}
 async receiverStatus(input:ReceiverSubmission):Promise<StatusResult>{void input;guard(this.id,this.mode,this.env);throw new EinvoiceProviderRefused(this.id,'not_implemented');}
}
export class GtiProvider implements EinvoiceProvider{
 readonly id='gti' as const;
 constructor(readonly mode:Exclude<EinvoiceProviderMode,'mock'>='sandbox',private readonly env:EinvoiceEnv=process.env){}
 private refuse():never{guard(this.id,this.mode,this.env);throw new EinvoiceProviderRefused(this.id,'not_implemented');}
 async issue(input:DocumentSubmission):Promise<IssueResult>{void input;return this.refuse();}
 async cancel(input:DocumentSubmission):Promise<IssueResult>{void input;return this.refuse();}
 async getStatus(input:DocumentSubmission):Promise<StatusResult>{void input;return this.refuse();}
 async receiverMessage(input:ReceiverSubmission):Promise<IssueResult>{void input;return this.refuse();}
 async receiverStatus(input:ReceiverSubmission):Promise<StatusResult>{void input;return this.refuse();}
}
