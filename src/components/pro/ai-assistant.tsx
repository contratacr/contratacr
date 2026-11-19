'use client';
import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {pushProParams} from '@/lib/pro/navigation';
import {AI_CONSENT_VERSION,AI_MONTHLY_LIMIT_MAX,aiConsentText,aiErrorCopy,aiLabel,type AiDraftFeature,type AiSettings,type AiSuggestion} from '@/lib/pro/ai/features';

/**
 * Round 6C: shared AI assistant UI.
 * · AiSettingsPanel (Company › Integraciones): data-processing consent (OFF by default), monthly cap and usage.
 * · AiDraftAssist: «Sugerir con IA» next to a text field. The suggestion appears in an editable box labelled
 *   «Generado con IA»; «Usar este texto» only copies it into the editor (the owner still saves it there).
 * · AiLabel: the visible label every AI result carries.
 */
export const aiApi='/api/pro/ai';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
export function useAiCopy(){const en=useLocale()==='en';return {en,t:(es:string,english:string)=>en?english:es,errorText:(reason:string|undefined,fallback:string)=>{const copy=reason?aiErrorCopy[reason]:undefined;return copy?(en?copy.en:copy.es):fallback;}};}
export function AiLabel({className=''}:{className?:string}){const {en}=useAiCopy();return <span data-ai-label className={'inline-flex items-center gap-1 rounded-full bg-[#f1ecff] px-2 py-0.5 text-xs font-bold text-[#4b2a99] '+className}>✦ {en?aiLabel.en:aiLabel.es}</span>;}
export async function aiPost(payload:Record<string,unknown>|FormData,url=aiApi):Promise<{ok:true;body:Record<string,unknown>}|{ok:false;status:number;reason?:string;error?:string}>{
 try{
  const response=await fetch(url,{method:'POST',cache:'no-store',...(payload instanceof FormData?{body:payload}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})});
  const body=await response.json().catch(()=>({})) as Record<string,unknown>;
  return response.ok?{ok:true,body}:{ok:false,status:response.status,reason:typeof body.reason==='string'?body.reason:undefined,error:typeof body.error==='string'?body.error:undefined};
 }catch{return {ok:false,status:0};}
}
export function reviewSuggestion(id:string,outcome:'used'|'discarded'){void aiPost({action:'review',id,outcome});}
export function ConsentHint(){
 const {t}=useAiCopy();
 return <p data-ai-consent-hint className="text-sm text-[#52627a]">{t('El asistente de IA está apagado hasta que autorice el tratamiento de datos.','The AI assistant is off until you authorize data processing.')} <button type="button" className="font-semibold text-[#008bb5] underline" onClick={()=>pushProParams({tab:'pro_company',empresa:'integraciones',cita:null,vistaTrabajo:null})}>{t('Ir a Integraciones','Go to Integrations')}</button></p>;
}

export function AiSettingsPanel(){
 const {en,t}=useAiCopy();
 const [settings,setSettings]=useState<AiSettings|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[limit,setLimit]=useState(''),[optimistic,setOptimistic]=useState<boolean|null>(null);
 const load=useCallback(async()=>{setFailed(false);try{const response=await fetch(aiApi+'?settings=1',{cache:'no-store'});if(!response.ok)throw Error();const body=await response.json() as AiSettings;setSettings(body);setLimit(String(body.monthlyLimit));}catch{setFailed(true);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function save(payload:Record<string,unknown>){
  if(!settings)return;setBusy(true);setError('');
  const result=await aiPost({...payload,actionId:crypto.randomUUID(),revision:settings.revision});
  setBusy(false);
  if(!result.ok){setError(result.status===409?t('La configuración cambió. Se actualizó; vuelva a intentarlo.','The settings changed. They were refreshed; try again.'):t('No se pudo guardar.','Could not save.'));await load();return;}
  const body=result.body as unknown as AiSettings;setSettings(body);setLimit(String(body.monthlyLimit));
 }
 if(failed)return <div role="alert" className="text-sm">{t('No se pudo cargar la configuración de IA.','Could not load the AI settings.')} <Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!settings)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 const percent=Math.min(100,Math.round(settings.usage.used/settings.monthlyLimit*100));
 return <div data-ai-settings data-ai-consent={settings.consent?'on':'off'} aria-busy={busy} className="space-y-3 rounded-xl border border-[#e5e7eb] p-3">
  <h4 className="text-sm font-bold">{t('Autorización y límite de uso','Authorization and usage limit')}</h4>
  <p className="rounded-lg bg-[#f7f9fc] p-2 text-xs text-[#38485f]">{en?aiConsentText.en:aiConsentText.es}</p>
  <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" data-ai-consent-toggle className="h-5 w-5 shrink-0 accent-[#0089bb]" checked={optimistic??settings.consent} disabled={busy} onChange={event=>{const next=event.target.checked;setOptimistic(next);void save({action:'set_consent',consent:next,consentVersion:AI_CONSENT_VERSION}).finally(()=>setOptimistic(null));}}/>{t('Autorizo el tratamiento de datos con IA para mi empresa','I authorize AI data processing for my company')}</label>
  {settings.consent&&settings.consentAt&&<p className="text-xs text-[#52627a]">{t('Autorizado el ','Authorized on ')}{new Date(settings.consentAt).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'})} · {t('versión ','version ')}{settings.consentVersion}</p>}
  <div className="space-y-1"><p className="text-sm" data-ai-usage={settings.usage.used}>{t(`Uso de ${settings.usage.month}: ${settings.usage.used} de ${settings.monthlyLimit} solicitudes`,`Usage for ${settings.usage.month}: ${settings.usage.used} of ${settings.monthlyLimit} requests`)}</p>
   <div className="h-2 w-full overflow-hidden rounded-full bg-[#eef2f6]" aria-hidden="true"><div className="h-full bg-[#0089bb]" style={{width:percent+'%'}}/></div></div>
  <form className="flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault();const n=Number(limit);if(!Number.isInteger(n)||n<1||n>AI_MONTHLY_LIMIT_MAX){setError(t(`Use un número entre 1 y ${AI_MONTHLY_LIMIT_MAX}.`,`Use a number between 1 and ${AI_MONTHLY_LIMIT_MAX}.`));return;}void save({action:'set_limit',monthlyLimit:n});}}>
   <label className="block min-w-0 text-sm font-semibold">{t('Límite mensual (solicitudes)','Monthly limit (requests)')}<input data-ai-limit inputMode="numeric" className={field+' w-32'} value={limit} onChange={event=>setLimit(event.target.value.replace(/\D/g,'').slice(0,4))}/></label>
   <Button type="submit" variant="secondary" disabled={busy} data-ai-limit-save>{t('Guardar límite','Save limit')}</Button></form>
  <p className="text-xs text-[#52627a]">{t('Cada sugerencia, lectura de plano, comprobante o transcripción cuenta como una solicitud. Al llegar al límite se bloquean hasta el próximo mes o hasta que lo amplíe.','Each suggestion, plan reading, receipt or transcription counts as one request. At the limit they are blocked until next month or until you raise it.')}</p>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </div>;
}

/** «Sugerir con IA» for one text field. getInput() is read at click time (current, unsaved editor values). */
export function AiDraftAssist({feature,workId=null,getInput,onUse,disabled=false,label}:{feature:AiDraftFeature;workId?:string|null;getInput:()=>{title?:string;current?:string;notes?:string;lines?:string[]};onUse:(text:string)=>void;disabled?:boolean;label?:string}){
 const {en,t,errorText}=useAiCopy(),id=useId();
 const [busy,setBusy]=useState(false),[error,setError]=useState<{reason:string;text:string}|null>(null),[suggestion,setSuggestion]=useState<{id:string;text:string}|null>(null),[text,setText]=useState('');
 const pending=useRef<{key:string;actionId:string}|null>(null);
 async function suggest(){
  setBusy(true);setError(null);
  const raw=getInput(),input={title:(raw.title??'').slice(0,200),current:(raw.current??'').slice(0,2000),notes:(raw.notes??'').slice(0,4000),lines:(raw.lines??[]).filter(Boolean).slice(0,30).map(line=>line.slice(0,300))};
  // Same request retried after an uncertain answer reuses its actionId: it is never counted twice.
  const key=JSON.stringify([feature,workId,input]);if(pending.current?.key!==key)pending.current={key,actionId:crypto.randomUUID()};
  const result=await aiPost({action:'suggest',actionId:pending.current.actionId,feature,workId,language:en?'en':'es',input});
  setBusy(false);
  if(!result.ok){if(result.status!==0&&result.status<500)pending.current=null;setError({reason:result.reason??'error',text:errorText(result.reason,result.status===0||result.status>=500?t('No se pudo confirmar. Reintente; no se cobrará dos veces.','Could not confirm. Retry; it will not be counted twice.'):t('No se pudo generar la sugerencia.','Could not generate the suggestion.'))});return;}
  pending.current=null;
  const body=result.body as unknown as AiSuggestion;
  if(body.status!=='ready'){setError({reason:'provider_failed',text:errorText('provider_failed','')});return;}
  const value=String((body.output as {text?:string}).text??'');setSuggestion({id:body.id,text:value});setText(value);
 }
 function close(outcome:'used'|'discarded'){if(suggestion)reviewSuggestion(suggestion.id,outcome);if(outcome==='used')onUse(text.trim());setSuggestion(null);setText('');}
 return <div data-ai-assist={feature} className="min-w-0 space-y-2">
  {!suggestion&&<Button type="button" variant="secondary" data-ai-suggest disabled={busy||disabled} onClick={()=>void suggest()} className="min-h-11">{busy?t('Generando sugerencia…','Generating suggestion…'):(label??t('✦ Sugerir con IA','✦ Suggest with AI'))}</Button>}
  {error&&(error.reason==='consent_required'?<ConsentHint/>:<p role="alert" data-ai-error={error.reason} className="text-sm text-red-700">{error.text}</p>)}
  {suggestion&&<div data-ai-suggestion={suggestion.id} className="min-w-0 space-y-2 rounded-xl border border-[#d9ccff] bg-[#faf8ff] p-3">
   <AiLabel/>
   <label htmlFor={id} className="sr-only">{t('Sugerencia editable','Editable suggestion')}</label>
   <textarea id={id} data-ai-suggestion-text className={field+' min-h-28'} maxLength={4000} value={text} onChange={event=>setText(event.target.value)}/>
   <p className="text-xs text-[#52627a]">{t('Es una sugerencia: revísela y edítela. «Usar este texto» solo la copia al formulario; se guarda cuando usted guarda el formulario.','This is a suggestion: review and edit it. “Use this text” only copies it into the form; it is saved when you save the form.')}</p>
   <div className="flex flex-wrap gap-2"><Button type="button" data-ai-use disabled={!text.trim()} onClick={()=>close('used')}>{t('Usar este texto','Use this text')}</Button><Button type="button" variant="secondary" data-ai-discard onClick={()=>close('discarded')}>{t('Descartar','Discard')}</Button></div>
  </div>}
 </div>;
}
