'use client';
import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import type {AiSuggestion,AiTakeoffOutput} from '@/lib/pro/ai/features';
import {AiLabel,ConsentHint,aiPost,reviewSuggestion,useAiCopy} from './ai-assistant';

/**
 * Round 6C (row 67): «Leer plano con IA». The assistant suggests measurement items (area / length / count) for
 * the open plan page. They appear as an editable DRAFT with a clear disclaimer; only the rows the owner keeps
 * are created, as manual measurements, through the existing takeoffs writer (onAdd). Nothing is saved before.
 */
export type TakeoffDraftItem={key:string;include:boolean;name:string;kind:'area'|'length'|'count';quantity:string;confidence:'low'|'medium'|'high';note:string};
const field='block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base';
export function AiTakeoffSuggestions({workId,planId,pageNumber,unit,disabled,onAdd}:{workId:string;planId:string;pageNumber:number;unit:'m'|'ft';disabled:boolean;onAdd:(items:TakeoffDraftItem[])=>Promise<boolean>}){
 const {en,t,errorText}=useAiCopy();
 const [busy,setBusy]=useState(false),[error,setError]=useState<{reason:string;text:string}|null>(null),[draft,setDraft]=useState<{id:string;items:TakeoffDraftItem[];warnings:string[]}|null>(null);
 const pending=useRef<{key:string;actionId:string}|null>(null);
 const unitLabel=(kind:TakeoffDraftItem['kind'])=>kind==='count'?t('u','u'):kind==='area'?(unit==='ft'?'ft²':'m²'):unit;
 const factor=(kind:TakeoffDraftItem['kind'])=>kind==='count'||unit==='m'?1:kind==='area'?10.7639:3.28084;
 async function read(){
  setBusy(true);setError(null);
  const key=planId+':'+pageNumber;if(pending.current?.key!==key)pending.current={key,actionId:crypto.randomUUID()};
  const result=await aiPost({action:'read_plan',actionId:pending.current.actionId,workId,planId,pageNumber,language:en?'en':'es'});
  setBusy(false);
  if(!result.ok){if(result.status!==0&&result.status<500)pending.current=null;setError({reason:result.reason??'error',text:errorText(result.reason,t('No se pudo leer el plano. Reintente.','Could not read the plan. Retry.'))});return;}
  pending.current=null;
  const body=result.body as unknown as AiSuggestion;
  if(body.status!=='ready'){setError({reason:'provider_failed',text:errorText('provider_failed','')});return;}
  const output=body.output as AiTakeoffOutput;
  setDraft({id:body.id,warnings:output.warnings,items:output.items.map((item,index)=>({key:body.id+':'+index,include:true,name:item.name,kind:item.kind,quantity:String(Math.round(item.quantity*factor(item.kind)*100)/100),confidence:item.confidence,note:item.note}))});
 }
 const valid=(item:TakeoffDraftItem)=>item.name.trim().length>0&&/^\d{1,9}(?:[.,]\d{1,3})?$/.test(item.quantity.trim())&&Number(item.quantity.replace(',','.'))>0;
 const chosen=draft?.items.filter(item=>item.include)??[];
 function patch(key:string,values:Partial<TakeoffDraftItem>){setDraft(old=>old?{...old,items:old.items.map(item=>item.key===key?{...item,...values}:item)}:old);}
 async function add(){if(!draft||!chosen.length||chosen.some(item=>!valid(item)))return;if(await onAdd(chosen)){reviewSuggestion(draft.id,'used');setDraft(null);}}
 return <section data-ai-takeoff className="min-w-0 space-y-3 rounded-xl border border-[#d9ccff] bg-[#faf8ff] p-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-sm font-bold text-[#162543]">{t('Sugerencias de medición con IA','AI measurement suggestions')}</h5>
   {!draft&&<Button type="button" variant="secondary" className="min-h-11" data-ai-read-plan disabled={busy||disabled} onClick={()=>void read()}>{busy?t('Leyendo plano…','Reading plan…'):t('✦ Leer plano con IA','✦ Read plan with AI')}</Button>}</div>
  <p data-ai-takeoff-disclaimer className="text-xs text-[#7a4b00]">{t('Borrador aproximado para revisar: la IA puede equivocarse y no ofrece precisión estructural ni de ingeniería. Verifique cada cantidad contra el plano y la escala antes de usarla.','Rough draft to review: AI can be wrong and offers no structural or engineering precision. Check every quantity against the plan and the scale before using it.')}</p>
  {error&&(error.reason==='consent_required'?<ConsentHint/>:<p role="alert" data-ai-error={error.reason} className="text-sm text-red-700">{error.text}</p>)}
  {draft&&<div data-ai-takeoff-draft={draft.id} className="space-y-3"><AiLabel/>
   {draft.warnings.map((warning,index)=><p key={index} className="text-xs text-[#52627a]">⚠ {warning}</p>)}
   <ul className="space-y-2">{draft.items.map(item=><li key={item.key} data-ai-takeoff-item={item.kind} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-lg border border-[#e5e7eb] bg-white p-2">
    <input type="checkbox" aria-label={t('Incluir','Include')} data-ai-takeoff-include className="mt-3 h-5 w-5 accent-[#0089bb]" checked={item.include} onChange={event=>patch(item.key,{include:event.target.checked})}/>
    <div className="min-w-0 space-y-2">
     <input aria-label={t('Nombre','Name')} data-ai-takeoff-name className={field} maxLength={120} value={item.name} onChange={event=>patch(item.key,{name:event.target.value})}/>
     <div className="grid grid-cols-2 gap-2"><select aria-label={t('Tipo','Type')} className={field} value={item.kind} onChange={event=>patch(item.key,{kind:event.target.value as TakeoffDraftItem['kind']})}><option value="area">{t('Área','Area')}</option><option value="length">{t('Longitud','Length')}</option><option value="count">{t('Conteo','Count')}</option></select>
      <label className="flex min-w-0 items-center gap-1"><input aria-label={t('Cantidad','Quantity')} data-ai-takeoff-quantity inputMode="decimal" className={field} value={item.quantity} onChange={event=>patch(item.key,{quantity:event.target.value.slice(0,14)})}/><span className="text-sm text-[#52627a]">{unitLabel(item.kind)}</span></label></div>
     <p className="text-xs text-[#52627a]">{t('Confianza: ','Confidence: ')}{({low:t('baja','low'),medium:t('media','medium'),high:t('alta','high')})[item.confidence]}{item.note?' · '+item.note:''}</p>
     {!valid(item)&&item.include&&<p className="text-xs text-red-700">{t('Revise el nombre y la cantidad.','Check the name and quantity.')}</p>}
    </div></li>)}</ul>
   <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" data-ai-takeoff-add disabled={disabled||!chosen.length||chosen.some(item=>!valid(item))} onClick={()=>void add()}>{t(`Agregar ${chosen.length} como mediciones`,`Add ${chosen.length} as measurements`)}</Button>
    <Button type="button" variant="secondary" className="min-h-11" data-ai-discard onClick={()=>{reviewSuggestion(draft.id,'discarded');setDraft(null);}}>{t('Descartar','Discard')}</Button></div>
  </div>}
 </section>;
}
