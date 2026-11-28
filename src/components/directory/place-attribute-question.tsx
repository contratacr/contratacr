'use client';
import {useState} from 'react';
import {HelpCircle} from 'lucide-react';
import {attrQuestionText,type AttrAnswer} from '@/lib/directory/place-questions';
import {ring} from './biz-ui';

/**
 * «¿Sabe si este lugar…?» card (548, 2026-11-27, Google Maps model). One question at a time: Sí / No / No sé. After an
 * answer: «Gracias» and, if there is one, the next question of `keys` in the same card. Without a session the buttons
 * go to the login. Shown after a review is posted and in «Información» while the place has unknown attributes.
 */
export function PlaceAttributeQuestion({slug,locale,keys,signedIn,loginHref,where}:{slug:string;locale:string;keys:string[];signedIn:boolean;loginHref:string|null;where:'info'|'review'}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const [i,setI]=useState(0),[busy,setBusy]=useState(false),[thanks,setThanks]=useState(false),[error,setError]=useState<string|null>(null);
 const key=keys[i];
 if(!key&&!thanks)return null;
 const send=async(answer:AttrAnswer)=>{
  if(!signedIn){window.location.assign(loginHref??'/login');return;}
  setBusy(true);setError(null);
  try{
   const r=await fetch(`/api/lugar/${encodeURIComponent(slug)}/atributos`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key,answer})});
   if(!r.ok){const j=await r.json().catch(()=>({})) as {reason?:string};
    setError(j.reason==='cap'?t('Alcanzó el máximo de respuestas por hoy.','You reached today’s answer limit.'):t('No se pudo guardar su respuesta. Intente de nuevo.','Your answer could not be saved. Please try again.'));return;}
   setThanks(true);setI(n=>n+1);
  }catch{setError(t('No se pudo guardar su respuesta. Intente de nuevo.','Your answer could not be saved. Please try again.'));}
  finally{setBusy(false);}
 };
 const btn=`inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-bold text-[#162543] hover:bg-[#F7FAFC] disabled:opacity-50 ${ring}`;
 return <section aria-label={t('Pregunta sobre este lugar','Question about this place')} data-place-attr-question={key??'done'} data-where={where} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-[#f3f9fc] p-4">
  {thanks&&<p role="status" className="text-sm font-semibold text-emerald-900" data-place-attr-thanks>{t('Gracias. Su respuesta ayuda a otras personas.','Thank you. Your answer helps other people.')}</p>}
  {key&&<>
   <p className="flex items-start gap-2 font-semibold text-[#162543]"><HelpCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#0083b0]"/>{attrQuestionText(key,en)}</p>
   <div className="flex flex-wrap gap-2">
    <button type="button" disabled={busy} onClick={()=>send('yes')} className={btn} data-attr-answer="yes">{t('Sí','Yes')}</button>
    <button type="button" disabled={busy} onClick={()=>send('no')} className={btn} data-attr-answer="no">No</button>
    <button type="button" disabled={busy} onClick={()=>send('unsure')} className={btn} data-attr-answer="unsure">{t('No sé','Not sure')}</button>
   </div>
   <p className="text-xs text-[#68778d]">{t('Se muestra como "Según clientes" cuando varias personas coinciden.','It shows as "According to customers" when several people agree.')}</p>
  </>}
  {error&&<p role="alert" className="text-sm font-semibold text-red-800">{error}</p>}
 </section>;
}
