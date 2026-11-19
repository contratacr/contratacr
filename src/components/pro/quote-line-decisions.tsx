'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {quoteLineDecisionsSchema,type QuoteLine,type QuoteLineDecisions as View} from '@/lib/pro/quote-line-decisions';
import {privateEstimateMoney} from './private-estimate-preview';

const api='/api/pro/quote-line-decisions';
/**
 * Fix 14 — parity register row 39: the shared quote version as a visual proposal, one card per line
 * («partida») with the catalog item's image when it has one. The customer approves or declines each
 * line (with an optional note) while the version is open; the professional sees the same cards with
 * every decision and the approved total. The version's own answer (accept / decline / changes) is
 * still given with the buttons of the quote.
 */
export function QuoteLineDecisions({actor,publicationId}:{actor:string;publicationId:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [view,setView]=useState<View|null>(null),[error,setError]=useState(''),[failed,setFailed]=useState(false),[busy,setBusy]=useState<string|null>(null),[notes,setNotes]=useState<Record<string,string>>({}),attempts=useRef<Record<string,{key:string;id:string}>>({}),seq=useRef(0);
 const load=useCallback(async()=>{const n=++seq.current;try{const r=await fetch(api+'?'+new URLSearchParams({publicationId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error();const body=quoteLineDecisionsSchema.parse(await r.json());if(n===seq.current){setView(body);setFailed(false);}}catch{if(n===seq.current)setFailed(true);}},[actor,publicationId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function decide(line:QuoteLine,decision:QuoteLine['decision']){
  if(!view?.canDecide||busy)return;const note=(notes[line.lineId]??line.note).trim().slice(0,300),key=JSON.stringify([line.lineId,decision,note,line.revision]);
  const attempt=attempts.current[line.lineId]?.key===key?attempts.current[line.lineId]:{key,id:crypto.randomUUID()};attempts.current[line.lineId]=attempt;
  setBusy(line.lineId);setError('');
  try{const r=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify({actionId:attempt.id,publicationId,lineId:line.lineId,decision,note,revision:line.revision})});
   if(r.status===409){delete attempts.current[line.lineId];setError(t('Esta partida cambió en otra pestaña. Se recargó la propuesta.','This item changed in another tab. The proposal was reloaded.'));await load();return;}
   if(r.status===400){delete attempts.current[line.lineId];setError(t('Esta versión ya no admite cambios por partida.','This version no longer accepts item decisions.'));await load();return;}
   if(!r.ok)throw Error();delete attempts.current[line.lineId];setView(quoteLineDecisionsSchema.parse(await r.json()));setNotes(old=>{const next={...old};delete next[line.lineId];return next;});}
  catch{setError(t('No se pudo comprobar el guardado. Intente de nuevo; la misma decisión no se duplica.','Could not confirm the save. Try again; the same decision is not duplicated.'));}finally{setBusy(null);}
 }
 if(failed&&!view)return <div role="alert" className="space-y-2 rounded-2xl border border-[#d7e1ea] p-3 text-sm"><p>{t('No se pudo cargar la propuesta por partidas.','Could not load the item proposal.')}</p><Button type="button" variant="outline" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!view)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando la propuesta por partidas…','Loading the item proposal…')}</p>;
 if(!view.lines.length)return null;
 const money=(cents:number)=>privateEstimateMoney(cents,view.currency,en),client=view.side==='client';
 const qty=(line:QuoteLine)=>new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:3}).format(line.qtyMilli/1000)+(line.unit?' '+line.unit:'');
 const badge=(d:QuoteLine['decision'])=>d==='approved'?<span className="rounded-full bg-[#e7f6ec] px-2 py-0.5 text-xs font-semibold text-[#1f6f43]">{t('Aprobada','Approved')}</span>:d==='declined'?<span className="rounded-full bg-[#fdecec] px-2 py-0.5 text-xs font-semibold text-[#8b1c1c]">{t('No aprobada','Not approved')}</span>:<span className="rounded-full bg-[#eef2f6] px-2 py-0.5 text-xs font-semibold text-[#52627a]">{t('Sin decidir','Not decided')}</span>;
 return <section data-quote-line-decisions={publicationId} aria-labelledby={'qld-'+publicationId} className="@container min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-3 sm:p-4">
  <div className="space-y-1"><h4 id={'qld-'+publicationId} className="font-bold text-[#162543]">{t('Propuesta por partidas','Item-by-item proposal')}</h4>
   <p className="text-sm text-[#52627a]">{client?(view.canDecide?t('Apruebe o no cada partida. Su profesional verá su decisión; la respuesta a la cotización completa se da con los botones de la cotización.','Approve or not each item. Your professional will see your decision; the answer to the whole quote is given with the quote buttons.'):t('Esta versión ya no admite decisiones por partida.','This version no longer accepts item decisions.')):t('Lo que el cliente aprobó o no en cada partida de esta versión.','What the customer approved or not on each item of this version.')}</p></div>
  <p data-quote-line-summary role="status" className="rounded-xl bg-[#f3f8fb] p-2 text-sm text-[#162543]"><strong>{t('Aprobado: ','Approved: ')}{money(view.approvedCents)}</strong>{' · '}{t(`${view.approvedCount} aprobadas, ${view.declinedCount} no aprobadas, ${view.pendingCount} sin decidir`,`${view.approvedCount} approved, ${view.declinedCount} not approved, ${view.pendingCount} not decided`)}{view.totalCents!==null?' · '+t('Total de la versión: ','Version total: ')+money(view.totalCents):''}</p>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  <ul className="grid gap-3 @2xl:grid-cols-2">{view.lines.map(line=><li key={line.lineId} data-quote-line={line.lineId} data-decision={line.decision??'none'} className={'min-w-0 space-y-2 rounded-xl border p-3 '+(line.decision==='approved'?'border-[#b9e0c8]':line.decision==='declined'?'border-[#f3c4bd]':'border-[#d7e1ea]')}>
   <div className="flex min-w-0 gap-3">
    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin JPEG of the line's catalog item. */}
    {line.hasImage?<img data-quote-line-image src={api+'?'+new URLSearchParams({publicationId,image:line.lineId})} alt={line.description} loading="lazy" className="h-20 w-20 shrink-0 rounded-lg border border-[#e5e7eb] object-cover"/>:<span aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-[#f3f8fb] text-xs text-[#68778d]">{t('Sin foto','No photo')}</span>}
    <div className="min-w-0 flex-1 space-y-1"><p className="break-words font-semibold text-[#162543]">{line.description||t('Partida','Item')}</p><p className="text-xs text-[#52627a]">{qty(line)} · {money(line.unitPriceCents)} {t('c/u','each')}</p><p className="text-sm font-bold">{money(line.totalCents)}</p>{badge(line.decision)}</div>
   </div>
   {line.note&&!(client&&view.canDecide)&&<p className="break-words rounded-lg bg-[#f7f9fc] p-2 text-sm text-[#52627a]">{t('Nota del cliente: ','Customer note: ')}{line.note}</p>}
   {client&&view.canDecide&&<div className="space-y-2">
    <label className="block text-xs font-semibold text-[#162543]">{t('Nota (opcional)','Note (optional)')}<input data-quote-line-note className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] px-3 text-base font-normal" maxLength={300} value={notes[line.lineId]??line.note} disabled={!!busy} onChange={e=>setNotes({...notes,[line.lineId]:e.target.value})}/></label>
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" className="min-h-11" data-quote-line-approve aria-pressed={line.decision==='approved'} variant={line.decision==='approved'?'default':'outline'} disabled={!!busy} onClick={()=>void decide(line,'approved')}>{busy===line.lineId?t('Guardando…','Saving…'):t('Aprobar','Approve')}</Button>
     <Button type="button" size="sm" className="min-h-11" data-quote-line-decline aria-pressed={line.decision==='declined'} variant={line.decision==='declined'?'default':'outline'} disabled={!!busy} onClick={()=>void decide(line,'declined')}>{t('No aprobar','Do not approve')}</Button>
     {line.decision&&<Button type="button" size="sm" variant="ghost" className="min-h-11" data-quote-line-clear disabled={!!busy} onClick={()=>void decide(line,null)}>{t('Quitar decisión','Clear decision')}</Button>}</div>
   </div>}
  </li>)}</ul>
 </section>;
}
