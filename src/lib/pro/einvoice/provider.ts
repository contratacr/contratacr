/**
 * Ronda F2-A: electronic-invoice PROVIDER adapter (row 58). One interface, three implementations:
 *  * `mock`             — deterministic local simulator of Hacienda's asynchronous flow (mock-provider.ts). Default.
 *  * `hacienda-sandbox` — Hacienda's test environment («recepción sandbox») through the existing ATV client;
 *                         refuses unless every env var below exists (stub-providers.ts).
 *  * `gti`              — GTI as an authorised provider; refuses until the owner signs the contract and supplies the
 *                         API contract and keys (stub-providers.ts).
 *
 * Mode gating (pure, like src/lib/email/provider.ts):
 *  * mock    — default, and ALWAYS when PRO_EINVOICE_PROVIDER is unset/mock or anything is missing.
 *  * sandbox — PRO_EINVOICE_PROVIDER=hacienda-sandbox|gti + that provider's sandbox env.
 *  * live    — ONLY PRO_EINVOICE_MODE=live AND NODE_ENV=production AND PRO_EINVOICE_LIVE_CONFIRMED=1 AND the live env.
 * Nothing in this file reads a secret VALUE: it checks presence only. Values are read by the real adapters,
 * server side, at call time.
 */
export const EINVOICE_PROVIDERS=['mock','hacienda-sandbox','gti'] as const;
export type EinvoiceProviderId=typeof EINVOICE_PROVIDERS[number];
export type EinvoiceProviderMode='mock'|'sandbox'|'live';
export type EinvoiceEnv=Record<string,string|undefined>;

/** Env names the owner must provide (documented in docs/pro/einvoice-pipeline-local.md). Never printed. */
export const EINVOICE_ENV={
 selector:'PRO_EINVOICE_PROVIDER',mode:'PRO_EINVOICE_MODE',liveConfirmed:'PRO_EINVOICE_LIVE_CONFIRMED',
 'hacienda-sandbox':{sandbox:['PRO_HACIENDA_SANDBOX_USERNAME','PRO_HACIENDA_SANDBOX_PASSWORD','PRO_HACIENDA_SANDBOX_P12_PATH','PRO_HACIENDA_SANDBOX_P12_PIN'],
  live:['PRO_HACIENDA_PROD_USERNAME','PRO_HACIENDA_PROD_PASSWORD','PRO_HACIENDA_PROD_P12_PATH','PRO_HACIENDA_PROD_P12_PIN']},
 gti:{sandbox:['PRO_GTI_SANDBOX_API_URL','PRO_GTI_SANDBOX_API_KEY','PRO_GTI_SANDBOX_COMPANY_ID'],live:['PRO_GTI_API_URL','PRO_GTI_API_KEY','PRO_GTI_COMPANY_ID']},
} as const;

export type EinvoiceResolution={id:EinvoiceProviderId;mode:EinvoiceProviderMode;status:'ready'|'refused';reason:null|'not_configured'|'live_not_allowed'|'unknown_provider';missing:string[]};
const has=(env:EinvoiceEnv,name:string)=>typeof env[name]==='string'&&env[name]!.trim().length>0;
export function resolveEinvoiceProvider(env:EinvoiceEnv=process.env):EinvoiceResolution{
 const selector=(env[EINVOICE_ENV.selector]??'').trim()||'mock';
 if(selector==='mock')return {id:'mock',mode:'mock',status:'ready',reason:null,missing:[]};
 if(selector!=='hacienda-sandbox'&&selector!=='gti')return {id:'mock',mode:'mock',status:'refused',reason:'unknown_provider',missing:[]};
 const wantsLive=env[EINVOICE_ENV.mode]==='live';
 if(wantsLive){
  const missing=EINVOICE_ENV[selector].live.filter(name=>!has(env,name));
  if(env.NODE_ENV!=='production'||env[EINVOICE_ENV.liveConfirmed]!=='1')return {id:selector,mode:'live',status:'refused',reason:'live_not_allowed',missing};
  return {id:selector,mode:'live',status:missing.length?'refused':'ready',reason:missing.length?'not_configured':null,missing};
 }
 const missing=EINVOICE_ENV[selector].sandbox.filter(name=>!has(env,name));
 return {id:selector,mode:'sandbox',status:missing.length?'refused':'ready',reason:missing.length?'not_configured':null,missing};
}

export type ProviderParty={type:string;number:string;name:string};
/** What every provider receives for an emitted document (FE/ND/NC/TE). `currentStatus`/`priorProcessingError` let a
 * stateless adapter answer like Hacienda does for a document it already knows (duplicate, still processing). */
export type DocumentSubmission={kind:'document';docType:'01'|'02'|'03'|'04';clave:string;consecutivo:string;issuedAt:string;emisor:ProviderParty;receptor:ProviderParty|null;
 signedXml:string;totalComprobante:string;totalImpuesto:string;attempt:number;currentStatus:string;priorProcessingError:boolean};
export type ReceiverSubmission={kind:'receiver';receivedClave:string;consecutivoReceptor:string;issuedAt:string;emisor:ProviderParty;receptor:ProviderParty;messageCode:'1'|'2'|'3';
 signedXml:string;attempt:number;currentStatus:string;priorProcessingError:boolean};
export type IssueResult={outcome:'received'|'duplicate'|'error';httpStatus:number;message:string;transient:boolean;timedOut:boolean;bodySha256?:string};
export type ProviderState='recibido'|'procesando'|'aceptado'|'rechazado'|'error';
export type StatusResult={state:ProviderState;httpStatus:number;message:string;responseXml?:string;responseCode?:1|2|3;reasons:string[];bodySha256?:string};
export interface EinvoiceProvider{
 readonly id:EinvoiceProviderId;readonly mode:EinvoiceProviderMode;
 /** POST of a signed FE/TE/ND (Hacienda: /recepcion → 202). */
 issue(input:DocumentSubmission):Promise<IssueResult>;
 /** GET of the answer (Hacienda: /recepcion/{clave} → ind-estado). */
 getStatus(input:DocumentSubmission):Promise<StatusResult>;
 /** Cancellation is a credit note (NC 03) referencing the original: same transport, kept separate for providers
  * (GTI) that expose «anular» as its own operation. */
 cancel(input:DocumentSubmission):Promise<IssueResult>;
 /** Aceptación / aceptación parcial / rechazo of a document RECEIVED from a supplier (MensajeReceptor). */
 receiverMessage(input:ReceiverSubmission):Promise<IssueResult>;
 receiverStatus(input:ReceiverSubmission):Promise<StatusResult>;
}
export class EinvoiceProviderRefused extends Error{
 constructor(readonly provider:EinvoiceProviderId,readonly reason:'not_configured'|'live_not_allowed'|'not_implemented'|'unknown_provider',readonly missing:string[]=[]){
  super(`E-invoice provider ${provider} refused: ${reason}`);this.name='EinvoiceProviderRefused';
 }
}
/** Mode stored on a document → provider mode. */
export const providerModeOf=(mode:'mock'|'sandbox'|'production'):EinvoiceProviderMode=>mode==='production'?'live':mode;
