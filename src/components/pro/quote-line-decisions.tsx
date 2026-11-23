'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {quoteLineDecisionsSchema,type QuoteLine,type QuoteLineDecisions as View} from '@/lib/pro/quote-line-decisions';
import {privateEstimateMoney} from './private-estimate-preview';
import {ProposalClosing,ProposalGallery,useProposalPublication} from './estimate-proposal';
import {QuoteLineResponse} from './quote-line-response';
import type {LineResponse} from '@/lib/pro/quote-recorded-acceptance';

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
 const proposal=useProposalPublication(actor,publicationId)?.proposal??null,photosOf=(target:'section'|'line',key:string)=>proposal?.images.filter(i=>i.target===target&&i.targetKey===key)??[];
 const [view,setView]=useState<View|null>(null),[error,setError]=useState(''),[failed,setFailed]=useState(false),[busy,setBusy]=useState<string|null>(null),[notes,setNotes]=useState<Record<string,string>>({}),attempts=useRef<Record<string,{key:string;id:string}>>({}),seq=useRef(0);
 const [response,setResponse]=useState<LineResponse|null>(null);
 const [converted,setConverted]=useState<{title:string;lineCount:number}|null>(null),convertAttempt=useRef<{actionId:string;targetEstimateId:string}|null>(null);
 async function convert(){
  if(busy||!view)return;if(!convertAttempt.current)convertAttempt.current={actionId:crypto.randomUUID(),targetEstimateId:crypto.randomUUID()};
  setBusy('convert');setError('');
  try{const r=await fetch('/api/pro/quote-line-convert',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify({...convertAttempt.current,publicationId})});
   if(r.status===400||r.status===409){convertAttempt.current=null;setError(t('No se pudo crear el borrador: ya no hay partidas aprobadas disponibles o esta versión cambió.','Could not create the draft: there are no approved items available or this version changed.'));await load();return;}
   if(!r.ok)throw Error();const body=await r.json() as {estimate?:{title?:string};lineCount?:number};setConverted({title:body.estimate?.title??'',lineCount:body.lineCount??0});}
  catch{setError(t('No se pudo comprobar el guardado. Intente de nuevo; no se creará dos veces.','Could not confirm the save. Try again; it will not be created twice.'));}finally{setBusy(null);}
 }
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
 const money=(cents:number)=>privateEstimateMoney(cents,view.currency,en),client=view.side==='client',canDecide=view.canDecide&&!response;
 const qty=(line:QuoteLine)=>new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:3}).format(line.qtyMilli/1000)+(line.unit?' '+line.unit:'');
 const badge=(d:QuoteLine['decision'])=>d==='approved'?<span className="rounded-full bg-[#e7f6ec] px-2 py-0.5 text-xs font-semibold text-[#1f6f43]">{t('Aprobada','Approved')}</span>:d==='declined'?<span className="rounded-full bg-[#fdecec] px-2 py-0.5 text-xs font-semibold text-[#8b1c1c]">{t('No aprobada','Not approved')}</span>:<span className="rounded-full bg-[#eef2f6] px-2 py-0.5 text-xs font-semibold text-[#52627a]">{t('Sin decidir','Not decided')}</span>;
 return <section data-quote-line-decisions={publicationId} aria-labelledby={'qld-'+publicationId} className="@container min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-3 sm:p-4">
  <div className="space-y-1"><h4 id={'qld-'+publicationId} className="font-bold text-[#162543]">{t('Propuesta por partidas','Item-by-item proposal')}</h4>
   <p className="text-sm text-[#52627a]">{client?(canDecide?t('Apruebe o no cada partida. Su profesional verá su decisión; la respuesta a la cotización completa se da con los botones de la cotización.','Approve or not each item. Your professional will see your decision; the answer to the whole quote is given with the quote buttons.'):t('Esta versión ya no admite decisiones por partida.','This version no longer accepts item decisions.')):t('Lo que el cliente aprobó o no en cada partida de esta versión.','What the customer approved or not on each item of this version.')}</p></div>
  <p data-quote-line-summary role="status" className="rounded-xl bg-[#f3f8fb] p-2 text-sm text-[#162543]"><strong>{t('Aprobado: ','Approved: ')}{money(view.approvedCents)}</strong>{' · '}{t(`${view.approvedCount} aprobadas, ${view.declinedCount} no aprobadas, ${view.pendingCount} sin decidir`,`${view.approvedCount} approved, ${view.declinedCount} not approved, ${view.pendingCount} not decided`)}{view.totalCents!==null?' · '+t('Total de la versión: ','Version total: ')+money(view.totalCents):''}</p>
  <QuoteLineResponse actor={actor} publicationId={publicationId} side={view.side} open={view.canDecide} pendingCount={view.pendingCount} approvedCount={view.approvedCount} declinedCount={view.declinedCount} money={money} onResponse={setResponse} onChanged={()=>void load()}/>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {!client&&view.approvedCount>0&&<div data-quote-convert className="space-y-2 rounded-xl border border-[#b9e0c8] bg-[#f4fbf7] p-3">{converted
   ?<p role="status" className="text-sm text-[#175b42]">{t(`Se creó un borrador con ${converted.lineCount} partidas aprobadas${converted.title?' ("'+converted.title+'")':''}. Ábralo en sus cotizaciones privadas para ajustarlo y compartirlo como la siguiente versión.`,`A draft with ${converted.lineCount} approved items was created${converted.title?' ("'+converted.title+'")':''}. Open it in your private quotes to adjust it and share it as the next version.`)}</p>
   :<><p className="text-sm text-[#162543]">{t('Cree un borrador nuevo solo con las partidas que el cliente aprobó. Esta versión no cambia.','Create a new draft with only the items the customer approved. This version does not change.')}</p><Button type="button" variant="secondary" disabled={busy!==null} onClick={()=>void convert()}>{t(`Crear borrador con las ${view.approvedCount} partidas aprobadas`,`Create a draft with the ${view.approvedCount} approved items`)}</Button></>}</div>}
  {sectionsOf(view.lines).map((section,sectionIndex)=><div key={sectionIndex} data-quote-line-section={section.name??''} className="min-w-0 space-y-2">{section.name&&<h5 className="pt-1 text-sm font-bold uppercase tracking-wide text-[#52627a]">{section.name}</h5>}{section.name&&photosOf('section',section.name).length>0&&<div data-proposal-section-photos={section.name} className="max-w-2xl"><ProposalGallery publicationId={publicationId} images={photosOf('section',section.name)}/></div>}
  <ul className="grid gap-3 @2xl:grid-cols-2">{section.lines.map(line=><li key={line.lineId} data-quote-line={line.lineId} data-decision={line.decision??'none'} className={'min-w-0 space-y-2 rounded-xl border p-3 '+(line.decision==='approved'?'border-[#b9e0c8]':line.decision==='declined'?'border-[#f3c4bd]':'border-[#d7e1ea]')}>
   {photosOf('line',line.lineId).length>0&&<div data-proposal-line-photos={line.lineId}><ProposalGallery compact publicationId={publicationId} images={photosOf('line',line.lineId)}/></div>}
   <div className="flex min-w-0 gap-3">
    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin JPEG of the line's catalog item. */}
    {photosOf('line',line.lineId).length>0?null:line.hasImage?<img data-quote-line-image src={api+'?'+new URLSearchParams({publicationId,image:line.lineId})} alt={line.description} loading="lazy" className="h-20 w-20 shrink-0 rounded-lg border border-[#e5e7eb] object-cover"/>:<span aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-[#f3f8fb] text-xs text-[#68778d]">{t('Sin foto','No photo')}</span>}
    <div className="min-w-0 flex-1 space-y-1"><p className="break-words font-semibold text-[#162543]">{line.description||t('Partida','Item')}</p><p className="text-xs text-[#52627a]">{qty(line)} · {money(line.unitPriceCents)} {t('c/u','each')}</p><p className="text-sm font-bold">{money(line.totalCents)}</p>{badge(line.decision)}</div>
   </div>
   {line.note&&!(client&&canDecide)&&<p className="break-words rounded-lg bg-[#f7f9fc] p-2 text-sm text-[#52627a]">{t('Nota del cliente: ','Customer note: ')}{line.note}</p>}
   {client&&canDecide&&<div className="space-y-2">
    <label className="block text-xs font-semibold text-[#162543]">{t('Nota (opcional)','Note (optional)')}<input data-quote-line-note className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] px-3 text-base font-normal" maxLength={300} value={notes[line.lineId]??line.note} disabled={!!busy} onChange={e=>setNotes({...notes,[line.lineId]:e.target.value})}/></label>
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" className="min-h-11" data-quote-line-approve aria-pressed={line.decision==='approved'} variant={line.decision==='approved'?'default':'outline'} disabled={!!busy} onClick={()=>void decide(line,'approved')}>{busy===line.lineId?t('Guardando…','Saving…'):t('Aprobar','Approve')}</Button>
     <Button type="button" size="sm" className="min-h-11" data-quote-line-decline aria-pressed={line.decision==='declined'} variant={line.decision==='declined'?'default':'outline'} disabled={!!busy} onClick={()=>void decide(line,'declined')}>{t('No aprobar','Do not approve')}</Button>
     {line.decision&&<Button type="button" size="sm" variant="ghost" className="min-h-11" data-quote-line-clear disabled={!!busy} onClick={()=>void decide(line,null)}>{t('Quitar decisión','Clear decision')}</Button>}</div>
   </div>}
  </li>)}</ul>
  {section.name&&<p data-quote-line-section-subtotal={section.name} className="flex justify-between gap-3 rounded-xl bg-[#f3f8fb] px-3 py-2 text-sm font-semibold text-[#162543]"><span className="min-w-0 break-words">{t('Subtotal de la sección','Section subtotal')} · {section.name}</span><span>{money(section.totalCents)}{section.approvedCents>0&&section.approvedCents!==section.totalCents?' · '+t('aprobado ','approved ')+money(section.approvedCents):''}</span></p>}</div>)}
 <ProposalClosing actor={actor} publicationId={publicationId}/>
 </section>;
}
/** Round F1-C: consecutive lines with the same section name, with the subtotal and the approved part. */
function sectionsOf(lines:QuoteLine[]){const out:{name:string|null;lines:QuoteLine[];totalCents:number;approvedCents:number}[]=[];for(const line of lines){const name=line.group??null,last=out.at(-1);const target=last&&last.name===name?last:(out.push({name,lines:[],totalCents:0,approvedCents:0}),out.at(-1)!);target.lines.push(line);target.totalCents+=line.totalCents;if(line.decision==='approved')target.approvedCents+=line.totalCents;}return out;}
