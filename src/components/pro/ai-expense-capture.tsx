'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {expenseMethodLabel,expensePaymentMethods,expenseVatRates} from '@/lib/pro/expenses';
import type {AiExpenseOutput,AiSuggestion,Transcript} from '@/lib/pro/ai/features';
import {AiLabel,ConsentHint,aiPost,reviewSuggestion,useAiCopy} from './ai-assistant';

/**
 * Round 6C (row 77): expense from a receipt photo or a voice note. The photo (or the audio, recorded in the
 * browser or chosen as a file) goes to the AI / transcription adapters; the extracted vendor, date, amount,
 * VAT and payment method come back as an editable SUGGESTION. «Usar en el formulario» only fills the expense
 * form (Round 4B fields); the owner reviews it and saves it with the form's own «Guardar». The voice note is
 * never stored. Round 6D: the receipt PHOTO is attached to the expense as its receipt (Round 4B receipts route)
 * after the expense is saved, unless the owner unticks «Adjuntar la foto como comprobante».
 */
export type ExpensePrefill={vendor:string;date:string;amount:string;vatRateBps:string;paymentMethod:string;concept:string;newSupplier:boolean;receipt?:File|null};
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
type Draft={id:string;transcript:string|null;values:ExpensePrefill;confidence:string;photo:File|null};
const RECEIPT_MAX_BYTES=3*1024*1024;
export function AiExpenseCapture({onApply,disabled=false}:{onApply:(values:ExpensePrefill)=>void;disabled?:boolean}){
 const {en,t,errorText}=useAiCopy();
 const [busy,setBusy]=useState(''),[error,setError]=useState<{reason:string;text:string}|null>(null),[draft,setDraft]=useState<Draft|null>(null),[recording,setRecording]=useState(false),[canRecord,setCanRecord]=useState(false);
 const recorder=useRef<MediaRecorder|null>(null),chunks=useRef<Blob[]>([]);
 useEffect(()=>{const timer=setTimeout(()=>setCanRecord(typeof window!=='undefined'&&'MediaRecorder' in window&&!!navigator.mediaDevices?.getUserMedia),0);return()=>{clearTimeout(timer);recorder.current?.stream.getTracks().forEach(track=>track.stop());};},[]);
 async function submit(action:'expense_receipt'|'expense_voice',file:Blob,name:string){
  const photo=action==='expense_receipt'&&file instanceof File&&file.size<=RECEIPT_MAX_BYTES?file:null;
  setBusy(action);setError(null);setDraft(null);
  const form=new FormData();form.append('action',action);form.append('actionId',crypto.randomUUID());form.append('language',en?'en':'es');form.append('file',file,name);
  const result=await aiPost(form);setBusy('');
  if(!result.ok){setError({reason:result.reason??'error',text:errorText(result.reason,t('No se pudo leer. Reintente.','Could not read it. Retry.'))});return;}
  const suggestion=result.body.suggestion as AiSuggestion|null,transcription=result.body.transcription as AiSuggestion|undefined;
  if(!suggestion||suggestion.status!=='ready'){setError({reason:'provider_failed',text:errorText('provider_failed','')});return;}
  const output=suggestion.output as AiExpenseOutput;
  setDraft({id:suggestion.id,photo,confidence:output.confidence,transcript:transcription?.status==='ready'?(transcription.output as Transcript).text:null,values:{vendor:output.vendor,date:output.date??'',amount:output.totalAmount!==null?output.totalAmount.toFixed(2):'',vatRateBps:output.vatRateBps?String(output.vatRateBps):'',paymentMethod:output.paymentMethod??'',concept:output.concept,newSupplier:!!output.vendor,receipt:photo}});
 }
 async function toggleRecording(){
  if(recording){recorder.current?.stop();return;}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true}),media=new MediaRecorder(stream);chunks.current=[];
   media.ondataavailable=event=>{if(event.data.size)chunks.current.push(event.data);};
   media.onstop=()=>{stream.getTracks().forEach(track=>track.stop());setRecording(false);const blob=new Blob(chunks.current,{type:media.mimeType||'audio/webm'});if(blob.size)void submit('expense_voice',blob,'nota.'+(blob.type.includes('mp4')?'m4a':'webm'));};
   recorder.current=media;media.start();setRecording(true);
  }catch{setError({reason:'microphone',text:t('No se pudo usar el micrófono. Puede elegir un archivo de audio.','The microphone could not be used. You can choose an audio file.')});}
 }
 const set=(values:Partial<ExpensePrefill>)=>setDraft(old=>old?{...old,values:{...old.values,...values}}:old);
 return <section data-ai-expense className="min-w-0 space-y-3 rounded-xl border border-[#d9ccff] bg-[#faf8ff] p-3">
  <h3 className="text-sm font-bold text-[#162543]">{t('✦ Capturar con IA (opcional)','✦ Capture with AI (optional)')}</h3>
  <p className="text-xs text-[#52627a]">{t('Tome una foto del comprobante o dicte el gasto. La IA propone los datos y usted los revisa antes de guardar.','Take a photo of the receipt or dictate the expense. AI proposes the details and you review them before saving.')}</p>
  {/* Final verification 2026-11-14: the file input covers its pill (transparent) instead of sr-only, so
      keyboard focus lands on a visible control and the pill shows the focus ring. */}
  <div className="flex flex-wrap gap-2">
   <label className={'relative inline-flex min-h-11 cursor-pointer items-center rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-semibold focus-within:ring-2 focus-within:ring-[#0089bb] focus-within:ring-offset-2 '+(busy||disabled?'pointer-events-none opacity-50':'')}>{busy==='expense_receipt'?t('Leyendo comprobante…','Reading receipt…'):t('Foto del comprobante','Receipt photo')}
    <input type="file" data-ai-receipt-input accept="image/jpeg,image/png,image/webp" capture="environment" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" disabled={!!busy||disabled} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void submit('expense_receipt',file,file.name);}}/></label>
   {canRecord&&<Button type="button" variant="secondary" data-ai-voice-record disabled={(!!busy&&!recording)||disabled} onClick={()=>void toggleRecording()}>{recording?t('■ Detener y enviar','■ Stop and send'):t('🎙 Grabar nota de voz','🎙 Record voice note')}</Button>}
   <label className={'relative inline-flex min-h-11 cursor-pointer items-center rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-semibold focus-within:ring-2 focus-within:ring-[#0089bb] focus-within:ring-offset-2 '+(busy||disabled?'pointer-events-none opacity-50':'')}>{busy==='expense_voice'?t('Transcribiendo…','Transcribing…'):t('Archivo de audio','Audio file')}
    <input type="file" data-ai-voice-input accept="audio/*" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" disabled={!!busy||disabled} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void submit('expense_voice',file,file.name);}}/></label>
  </div>
  {error&&(error.reason==='consent_required'?<ConsentHint/>:<p role="alert" data-ai-error={error.reason} className="text-sm text-red-700">{error.text}</p>)}
  {draft&&<div data-ai-expense-draft={draft.id} className="space-y-3"><AiLabel/>
   {draft.transcript&&<p data-ai-voice-transcript className="rounded-lg bg-white p-2 text-sm text-[#38485f]">&quot;{draft.transcript}&quot;</p>}
   <div className="grid min-w-0 gap-3 sm:grid-cols-2">
    <label className="block min-w-0 text-sm font-medium">{t('Proveedor','Vendor')}<input data-ai-expense-field="vendor" className={field} maxLength={160} value={draft.values.vendor} onChange={event=>set({vendor:event.target.value})}/></label>
    <label className="block min-w-0 text-sm font-medium">{t('Fecha','Date')}<input type="date" data-ai-expense-field="date" className={field} value={draft.values.date} onChange={event=>set({date:event.target.value})}/></label>
    <label className="block min-w-0 text-sm font-medium">{t('Importe total ₡','Total amount ₡')}<input data-ai-expense-field="amount" inputMode="decimal" className={field} value={draft.values.amount} onChange={event=>set({amount:event.target.value.slice(0,14)})}/></label>
    <label className="block min-w-0 text-sm font-medium">{t('IVA incluido','VAT included')}<select data-ai-expense-field="vat" className={field} value={draft.values.vatRateBps} onChange={event=>set({vatRateBps:event.target.value})}><option value="">{t('No separar','Do not split')}</option>{expenseVatRates.map(rate=><option key={rate} value={rate}>{(rate/100).toLocaleString(en?'en-US':'es-CR')+(en?'%':' %')}</option>)}</select></label>
    <label className="block min-w-0 text-sm font-medium">{t('Medio de pago','Payment method')}<select data-ai-expense-field="method" className={field} value={draft.values.paymentMethod} onChange={event=>set({paymentMethod:event.target.value})}><option value="">{t('Sin indicar','Not stated')}</option>{expensePaymentMethods.map(value=><option key={value} value={value}>{expenseMethodLabel(value,en)}</option>)}</select></label>
    <label className="block min-w-0 text-sm font-medium">{t('Concepto','Description')}<input data-ai-expense-field="concept" className={field} maxLength={300} value={draft.values.concept} onChange={event=>set({concept:event.target.value})}/></label>
   </div>
   {draft.values.vendor.trim()&&<label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-[#0089bb]" checked={draft.values.newSupplier} onChange={event=>set({newSupplier:event.target.checked})}/>{t('Crear un proveedor nuevo con este nombre (desmarque para elegir uno guardado)','Create a new supplier with this name (untick to choose a saved one)')}</label>}
   {draft.photo&&<label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" data-ai-attach-receipt className="h-5 w-5 accent-[#0089bb]" checked={!!draft.values.receipt} onChange={event=>set({receipt:event.target.checked?draft.photo:null})}/>{t('Adjuntar la foto como comprobante del gasto (al guardar)','Attach the photo as the expense receipt (on save)')}</label>}
   <p className="text-xs text-[#52627a]">{t('Confianza de la lectura: ','Reading confidence: ')}{({low:t('baja','low'),medium:t('media','medium'),high:t('alta','high')} as Record<string,string>)[draft.confidence]??draft.confidence}. {t('Nada se guarda hasta que pulse "Guardar" en el formulario.','Nothing is saved until you press "Save" in the form.')}</p>
   <div className="flex flex-wrap gap-2"><Button type="button" data-ai-expense-apply onClick={()=>{onApply(draft.values);reviewSuggestion(draft.id,'used');setDraft(null);}}>{t('Usar en el formulario','Use in the form')}</Button>
    <Button type="button" variant="secondary" data-ai-discard onClick={()=>{reviewSuggestion(draft.id,'discarded');setDraft(null);}}>{t('Descartar','Discard')}</Button></div>
  </div>}
 </section>;
}
