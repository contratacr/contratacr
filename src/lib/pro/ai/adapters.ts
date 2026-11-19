import {createHash} from 'node:crypto';
import {AI_DEFAULT_MODEL,TRANSCRIPTION_DEFAULT_MODEL} from '../integrations/registry';
import type {AiFeature,Transcript} from './features';
import {SYSTEM_PROMPT,schemaFor} from './prompts';

/**
 * Round 6C: provider adapters.
 * · AI: MockAiAdapter (deterministic fixtures, no network) and AnthropicAdapter (Claude Messages API over fetch,
 *   structured JSON output; ACTIVE ONLY when PRO_ANTHROPIC_API_KEY exists and the owner chose sandbox/production).
 * · Transcription: MockTranscriber and OpenAiCompatibleTranscriber (/v1/audio/transcriptions; works with OpenAI
 *   and compatible services through PRO_TRANSCRIPTION_BASE_URL). Same activation rule.
 * Every outbound call is recorded in `calls` (operation, URL, status, duration, counts) for the redacted log.
 */
export type Attachment={kind:'image'|'pdf';mime:string;bytes:Uint8Array};
export type AiCall={feature:AiFeature;prompt:string;language:'es'|'en';attachment?:Attachment;seed:string;hints?:Record<string,string>};
export type AiResult={ok:true;output:unknown;model:string;usage:{inputTokens:number;outputTokens:number}|null}|{ok:false;reason:'provider_failed'|'refused'|'truncated';status:number};
export type CallRecord={operation:string;url:string;status:number|null;outcome:'ok'|'error'|'timeout';durationMs:number;summary:Record<string,unknown>};
export interface AiAdapter{readonly model:string;readonly calls:CallRecord[];complete(call:AiCall):Promise<AiResult>}
export interface Transcriber{readonly model:string;readonly calls:CallRecord[];transcribe(audio:{bytes:Uint8Array;mime:string;kind:'meeting'|'voice_note';language:'es'|'en'}):Promise<{ok:true;transcript:Transcript}|{ok:false;status:number}>}

const digest=(text:string)=>createHash('sha256').update(text).digest();
/** fetch with a hard timeout (status 0 on network failure). Injectable so the unit tests never touch the network. */
export type Fetcher=(url:string,init:RequestInit,timeoutMs:number)=>Promise<{response:Response|null;status:number;durationMs:number;timedOut:boolean}>;
export const timedFetch:Fetcher=async(url,init,timeoutMs)=>{
 const controller=new AbortController(),started=Date.now(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{const response=await fetch(url,{...init,signal:controller.signal,cache:'no-store',redirect:'error'});return {response,status:response.status,durationMs:Date.now()-started,timedOut:false};}
 catch{return {response:null,status:0,durationMs:Date.now()-started,timedOut:controller.signal.aborted};}
 finally{clearTimeout(timer);}
};
const pick=<T,>(seed:string,list:readonly T[],salt=0)=>list[digest(seed+':'+salt)[0]!%list.length]!;
const crToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date());

// ------------------------------------------------------------------ mock AI (deterministic fixtures)
export class MockAiAdapter implements AiAdapter{
 readonly model='mock-claude-local';readonly calls:CallRecord[]=[];
 async complete(call:AiCall):Promise<AiResult>{
  const started=Date.now(),output=mockOutput(call);
  this.calls.push({operation:'ai_'+call.feature,url:'https://ai.mock.local/v1/messages',status:200,outcome:'ok',durationMs:Date.now()-started,summary:{feature:call.feature,promptChars:call.prompt.length,attachment:call.attachment?.kind??null}});
  return {ok:true,output,model:this.model,usage:null};
 }
}
function mockOutput(call:AiCall):unknown{
 const en=call.language==='en',h=call.hints??{},title=(h.title||'').slice(0,120),service=(h.service||'').slice(0,120);
 switch(call.feature){
  case 'quote_line':return {text:en?`Supply and installation of ${title||'the listed work'}: includes surface preparation, the materials specified in this quote, labour and final cleaning of the area.`:`Suministro e instalación de ${title||'los trabajos indicados'}: incluye preparación de la superficie, los materiales indicados en esta cotización, mano de obra y limpieza final del área.`};
  case 'contract_clause':return {text:en?`${title||'Clause'}: The professional will carry out {{work_service}} for {{client_name}} as described in the accepted quote. Any change in scope, materials or dates will be agreed in writing beforehand. This draft must be reviewed before signing.`:`${title||'Cláusula'}: El profesional ejecutará {{work_service}} para {{client_name}} según lo descrito en la cotización aceptada. Cualquier cambio de alcance, materiales o fechas se acordará por escrito antes de realizarse. Este borrador debe revisarse antes de firmar.`};
  case 'daily_log':return {text:en?`Work continued on ${service||'the job'}. ${h.notes?'Notes: '+h.notes.slice(0,300)+'. ':''}No incidents reported. Next step: continue as scheduled and confirm materials for tomorrow.`:`Se avanzó en ${service||'el trabajo'}. ${h.notes?'Notas: '+h.notes.slice(0,300)+'. ':''}Sin incidentes reportados. Siguiente paso: continuar según lo programado y confirmar los materiales para mañana.`};
  case 'client_update':return {text:en?`Hello${h.firstName?' '+h.firstName:''}, here is an update on ${service||'your project'}: work is progressing as planned${h.notes?' ('+h.notes.slice(0,200)+')':''}. We will let you know before any change. Thank you!`:`Hola${h.firstName?' '+h.firstName:''}, le compartimos el avance de ${service||'su proyecto'}: el trabajo avanza según lo planeado${h.notes?' ('+h.notes.slice(0,200)+')':''}. Le avisaremos antes de cualquier cambio. ¡Muchas gracias!`};
  case 'takeoff':{
   const factor=1+(digest(call.seed)[1]!%20)/100,room=en?['Living room floor','Kitchen floor','Bedroom floor']:['Piso de sala','Piso de cocina','Piso de dormitorio'];
   return {items:[
    {name:pick(call.seed,room),kind:'area',quantity:Math.round(24.5*factor*100)/100,unit:'m2',confidence:'low',note:en?'Estimated from the drawn outline; verify with the scale.':'Estimado del contorno dibujado; verifique con la escala.'},
    {name:en?'Perimeter walls':'Paredes perimetrales',kind:'length',quantity:Math.round(38.2*factor*100)/100,unit:'m',confidence:'low',note:''},
    {name:en?'Interior partition':'División interior',kind:'length',quantity:Math.round(9.6*factor*100)/100,unit:'m',confidence:'medium',note:''},
    {name:en?'Doors':'Puertas',kind:'count',quantity:3,unit:'u',confidence:'medium',note:''},
    {name:en?'Windows':'Ventanas',kind:'count',quantity:4,unit:'u',confidence:'low',note:''},
   ],warnings:[en?'Simulated reading: no AI provider was contacted. Check every value against the plan.':'Lectura simulada: no se contactó a ningún proveedor de IA. Revise cada valor contra el plano.']};
  }
  case 'expense_receipt':{
   const amount=[45200,18750,96300,12990][digest(call.seed)[2]!%4]!,vat=Math.round((amount-amount/1.13)*100)/100;
   return {vendor:pick(call.seed,['Ferretería El Pino','Depósito La Central','Materiales San José']),date:crToday(),totalAmount:amount,vatRateBps:1300,vatAmount:vat,paymentMethod:pick(call.seed,['card','sinpe','cash'] as const,3),concept:en?'Construction materials':'Materiales de construcción',confidence:'medium'};
  }
  case 'expense_voice':return mockVoiceExtraction(h.transcript??'',en);
  case 'meeting':return {summary:en?`Site meeting about ${service||'the job'}: the customer approved the tile sample and asked to move the kitchen outlet. The schedule stays the same.`:`Reunión en sitio sobre ${service||'el trabajo'}: el cliente aprobó la muestra de azulejo y pidió mover el tomacorriente de la cocina. El cronograma se mantiene.`,
   actionItems:[{text:en?'Order the approved tile':'Pedir el azulejo aprobado',dueDate:null},{text:en?'Move the kitchen outlet':'Mover el tomacorriente de la cocina',dueDate:null},{text:en?'Send the customer the updated quote':'Enviar al cliente la cotización actualizada',dueDate:null}],
   decisions:[en?'Tile sample approved':'Muestra de azulejo aprobada']};
 }
 return {text:''};
}
/** Deterministic «extraction» from a mock transcript: amount digits, payment words, vendor after «en/at». */
export function mockVoiceExtraction(transcript:string,en:boolean){
 const amountMatch=transcript.match(/(\d{1,3}(?:[ .,]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:colones|₡)/i),amount=amountMatch?Number(amountMatch[1]!.replace(/[ .,]/g,'')+(amountMatch[2]?'.'+amountMatch[2]:'')):null;
 const lower=transcript.toLowerCase(),method=lower.includes('sinpe')?'sinpe':/tarjeta|card/.test(lower)?'card':/efectivo|cash/.test(lower)?'cash':/transferencia|transfer/.test(lower)?'transfer':null;
 const vendor=(transcript.match(/(?:en|at)\s+((?:[A-ZÁÉÍÓÚÑ][\wáéíóúñ]*\s?){1,4})/)?.[1]??'').trim();
 return {vendor,date:/\b(hoy|today)\b/i.test(transcript)?crToday():null,totalAmount:amount&&amount>0?amount:null,vatRateBps:null,vatAmount:null,paymentMethod:method,concept:en?'Materials (voice note)':'Materiales (nota de voz)',confidence:amount?'medium':'low'};
}

// ------------------------------------------------------------------ Anthropic Claude (Messages API, raw HTTP)
const ANTHROPIC_VERSION='2026-10-21';
/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS=new Set(['claude-sonnet-5-5','claude-opus-5-5','claude-opus-5','claude-fable-5-1','claude-fable-5-2']);
export class AnthropicAdapter implements AiAdapter{
 readonly calls:CallRecord[]=[];readonly model:string;private readonly key:string;private readonly base:string;
constructor(secrets:Record<string,string>,configuredModel?:string,private readonly fetcher:Fetcher=timedFetch){
  this.key=secrets.PRO_ANTHROPIC_API_KEY!;this.model=(secrets.PRO_ANTHROPIC_MODEL||configuredModel||AI_DEFAULT_MODEL).trim();
  this.base=(secrets.PRO_ANTHROPIC_BASE_URL||'https://api.anthropic.com').replace(/\/+$/,'');
 }
 async complete(call:AiCall):Promise<AiResult>{
  const content:unknown[]=[];
  if(call.attachment){const data=Buffer.from(call.attachment.bytes).toString('base64');content.push(call.attachment.kind==='pdf'?{type:'document',source:{type:'base64',media_type:'application/pdf',data}}:{type:'image',source:{type:'base64',media_type:call.attachment.mime,data}});}
  content.push({type:'text',text:call.prompt});
  const fallback=FALLBACK_MODELS.has(this.model);
  const body={model:this.model,max_tokens:call.feature==='takeoff'||call.feature==='meeting'?8000:2000,system:SYSTEM_PROMPT,messages:[{role:'user',content}],
   output_config:{effort:call.feature==='takeoff'?'medium':'low',format:{type:'json_schema',schema:schemaFor(call.feature)}},...(fallback?{fallbacks:'default'}:{})};
  const url=this.base+'/v1/messages';
  const sent=await this.fetcher(url,{method:'POST',headers:{'content-type':'application/json','x-api-key':this.key,'anthropic-version':ANTHROPIC_VERSION,...(fallback?{'anthropic-beta':'server-side-fallback-2026-07-01'}:{})},body:JSON.stringify(body)},90000);
  const record:CallRecord={operation:'ai_'+call.feature,url,status:sent.status||null,outcome:sent.timedOut?'timeout':sent.status===200?'ok':'error',durationMs:sent.durationMs,summary:{feature:call.feature,model:this.model,promptChars:call.prompt.length,attachment:call.attachment?.kind??null}};
  this.calls.push(record);
  if(!sent.response||sent.status!==200)return {ok:false,reason:'provider_failed',status:sent.status};
  try{
   const json=await sent.response.json() as {model?:string;stop_reason?:string;content?:{type:string;text?:string}[];usage?:{input_tokens?:number;output_tokens?:number}};
   record.summary={...record.summary,stop:json.stop_reason??null,inputTokens:json.usage?.input_tokens??null,outputTokens:json.usage?.output_tokens??null};
   if(json.stop_reason==='refusal')return {ok:false,reason:'refused',status:200};
   if(json.stop_reason==='max_tokens')return {ok:false,reason:'truncated',status:200};
   const text=(json.content??[]).filter(block=>block.type==='text').map(block=>block.text??'').join('');
   return {ok:true,output:JSON.parse(text),model:json.model??this.model,usage:{inputTokens:json.usage?.input_tokens??0,outputTokens:json.usage?.output_tokens??0}};
  }catch{return {ok:false,reason:'provider_failed',status:200};}
 }
}

// ------------------------------------------------------------------ transcription
const mockTranscripts={
 voice_note:{es:'Compré dos sacos de cemento y varilla en Ferretería El Pino por 18 500 colones, pagué con SINPE Móvil hoy.',en:'I bought two bags of cement and rebar at El Pino Hardware for 18,500 colones, paid with SINPE Móvil today.'},
 meeting:{es:'Profesional: Buenos días, todos sabemos que esta reunión se graba con su permiso. Cliente: Sí, de acuerdo. Profesional: Revisemos la muestra de azulejo. Cliente: Me gusta, la apruebo. También quisiera mover el tomacorriente de la cocina unos 40 centímetros. Profesional: Perfecto, lo agregamos y le envío la cotización actualizada. El cronograma se mantiene.',
  en:'Professional: Good morning, we all know this meeting is recorded with your permission. Customer: Yes, agreed. Professional: Let us review the tile sample. Customer: I like it, I approve it. I would also like to move the kitchen outlet about 40 centimetres. Professional: Perfect, we will add it and I will send you the updated quote. The schedule stays the same.'},
};
export class MockTranscriber implements Transcriber{
 readonly model='mock-transcriber-local';readonly calls:CallRecord[]=[];
 async transcribe(audio:{bytes:Uint8Array;mime:string;kind:'meeting'|'voice_note';language:'es'|'en'}){
  const text=mockTranscripts[audio.kind][audio.language];
  this.calls.push({operation:'transcribe_'+audio.kind,url:'https://transcription.mock.local/v1/audio/transcriptions',status:200,outcome:'ok',durationMs:0,summary:{bytes:audio.bytes.length,mime:audio.mime}});
  return {ok:true as const,transcript:{text,language:audio.language,durationSeconds:Math.max(1,Math.round(audio.bytes.length/4000))}};
 }
}
export class OpenAiCompatibleTranscriber implements Transcriber{
 readonly calls:CallRecord[]=[];readonly model:string;private readonly key:string;private readonly base:string;private readonly language:'auto'|'es'|'en';
 constructor(secrets:Record<string,string>,config:{model?:string;language?:'auto'|'es'|'en'},private readonly fetcher:Fetcher=timedFetch){
  this.key=secrets.PRO_TRANSCRIPTION_API_KEY!;this.model=(secrets.PRO_TRANSCRIPTION_MODEL||config.model||TRANSCRIPTION_DEFAULT_MODEL).trim();this.language=config.language??'auto';
  this.base=(secrets.PRO_TRANSCRIPTION_BASE_URL||'https://api.openai.com').replace(/\/+$/,'');
 }
 async transcribe(audio:{bytes:Uint8Array;mime:string;kind:'meeting'|'voice_note';language:'es'|'en'}){
  const form=new FormData(),extension=audio.mime.includes('webm')?'webm':audio.mime.includes('ogg')?'ogg':audio.mime.includes('wav')?'wav':audio.mime.includes('mp4')||audio.mime.includes('m4a')||audio.mime.includes('aac')?'m4a':'mp3';
  form.append('file',new Blob([Buffer.from(audio.bytes)],{type:audio.mime}),'audio.'+extension);form.append('model',this.model);form.append('response_format','verbose_json');
  const language=this.language==='auto'?audio.language:this.language;form.append('language',language);
  const url=this.base+'/v1/audio/transcriptions',sent=await this.fetcher(url,{method:'POST',headers:{authorization:'Bearer '+this.key},body:form},180000);
  this.calls.push({operation:'transcribe_'+audio.kind,url,status:sent.status||null,outcome:sent.timedOut?'timeout':sent.status===200?'ok':'error',durationMs:sent.durationMs,summary:{bytes:audio.bytes.length,mime:audio.mime,model:this.model}});
  if(!sent.response||sent.status!==200)return {ok:false as const,status:sent.status};
  try{const json=await sent.response.json() as {text?:string;language?:string;duration?:number};if(!json.text?.trim())return {ok:false as const,status:200};
   return {ok:true as const,transcript:{text:json.text.trim().slice(0,60000),language:(json.language??language).slice(0,10),durationSeconds:typeof json.duration==='number'?json.duration:null}};}
  catch{return {ok:false as const,status:200};}
 }
}
export const seedOf=(...parts:(string|Uint8Array)[])=>{const hash=createHash('sha256');for(const part of parts)hash.update(part);return hash.digest('hex');};
