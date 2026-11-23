'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {CheckCircle2,Circle} from 'lucide-react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {navigatePro} from '@/lib/pro/navigation';
import {trainingLessons} from '@/lib/pro/help-content';

/** Row 74: short training lessons with progress saved per account. The person marks each lesson done or not done. */
export function ProTraining(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,alive=useRef(true);
 const [done,setDone]=useState<Set<string>|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState('');
 const load=useCallback(async()=>{setFailed(false);try{const r=await fetch('/api/pro/company-training',{cache:'no-store'});if(!r.ok)throw Error();const body=await r.json() as {completed:{key:string}[]};if(alive.current)setDone(new Set(body.completed.map(c=>c.key)));}catch{if(alive.current)setFailed(true);}},[]);
 useEffect(()=>{alive.current=true;const timer=setTimeout(()=>void load(),0);return()=>{alive.current=false;clearTimeout(timer);};},[load]);
 async function toggle(key:string,completed:boolean){
  setBusy(key);setError('');
  try{const r=await fetch('/api/pro/company-training',{method:'POST',headers:{'Content-Type':'application/json',Origin:location.origin},body:JSON.stringify({lessonKey:key,completed})});if(!r.ok)throw Error();const body=await r.json() as {completed:{key:string}[]};setDone(new Set(body.completed.map(c=>c.key)));}
  catch{setError(t('No se pudo guardar su avance. Reintente.','Could not save your progress. Retry.'));}finally{setBusy(null);}
 }
 if(failed)return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudo cargar la formación.','Could not load the training.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!done)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 const count=trainingLessons.filter(l=>done.has(l.key)).length;
 return <div data-training className="min-w-0 space-y-3">
  <p data-training-progress className="text-sm text-[#52627a]">{t(`${count} de ${trainingLessons.length} lecciones completadas.`,`${count} of ${trainingLessons.length} lessons completed.`)}</p>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  <ul className="grid min-w-0 gap-3 lg:grid-cols-2">{trainingLessons.map(l=>{const ok=done.has(l.key);return <li key={l.key} data-lesson={l.key} data-done={ok?'true':'false'} className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <div className="flex items-start gap-2">{ok?<CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[#18794e]"/>:<Circle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[#94a3b8]"/>}<div className="min-w-0"><h3 className="font-bold">{l.title[en?'en':'es']}</h3><p className="text-xs text-[#52627a]">{t(`${l.minutes} minutos`,`${l.minutes} minutes`)}{ok?t(' · completada',' · completed'):''}</p></div></div>
   <ol className="list-decimal space-y-1 pl-6 text-sm text-[#52627a]">{l.steps.map((s,i)=><li key={i}>{s[en?'en':'es']}</li>)}</ol>
   <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={()=>navigatePro(l.go.tab,l.go.params)}>{t('Abrir la herramienta','Open the tool')}</Button><Button type="button" variant="ghost" disabled={busy===l.key} onClick={()=>void toggle(l.key,!ok)}>{ok?t('Marcar como pendiente','Mark as to do'):t('Marcar como completada','Mark as completed')}</Button></div>
  </li>;})}</ul></div>;
}
