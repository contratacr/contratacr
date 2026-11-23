'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {surchargeDetailSchema,surchargeResultSchema,surchargeSendSchema,type AllowanceItem,type SurchargeDetail} from '@/lib/pro/allowances';

/**
 * Row 75: «Send surcharge to a quote». The positive difference of a defined allowance becomes one surcharge line
 * in a DRAFT estimate of the same job. Idempotent by actionId; both the allowance and the estimate revisions are checked.
 * Nothing is charged, invoiced or sent to the customer: the estimate stays a private draft until the owner shares it.
 */
const api='/api/pro/allowance-surcharge',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const VAT=[{bp:1300,es:'IVA 13 %',en:'VAT 13%'},{bp:400,es:'IVA 4 %',en:'VAT 4%'},{bp:200,es:'IVA 2 %',en:'VAT 2%'},{bp:100,es:'IVA 1 %',en:'VAT 1%'},{bp:0,es:'Sin IVA',en:'No VAT'}];
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(value));

function copy(en:boolean){return en?{
 send:'Send surcharge to a quote',title:'Send the difference to a quote',intro:(v:string)=>`A surcharge line of ${v} is added to the draft quote you choose. Nothing is charged or sent to your customer: you decide when to share the quote.`,
 estimate:'Draft quote of this job',tax:'VAT of the surcharge',confirm:'Add surcharge',cancel:'Cancel',saving:'Saving…',
 none:'This job has no draft quote in colones. Create one in Quotes to send the surcharge there.',
 sent:(t:string,v:string,d:string)=>`Surcharge of ${v} sent to the quote "${t}" on ${d}.`,removed:(t:string)=>`The surcharge line is no longer in the quote "${t}". You can send it again.`,
 done:'Surcharge added to the quote.',conflict:'The allowance or the quote changed. Reloaded: review and try again.',failed:'Could not confirm. Retry the same operation: it is never applied twice.',retry:'Retry the same operation',
 lines:(n:number)=>`${n===1?'1 line':n+' lines'}`,loadError:'Could not check the quotes.',
}:{
 send:'Enviar recargo a cotización',title:'Enviar la diferencia a una cotización',intro:(v:string)=>`Se agrega una línea de recargo de ${v} a la cotización en borrador que elija. No se cobra ni se envía nada a su cliente: usted decide cuándo compartir la cotización.`,
 estimate:'Cotización en borrador de este trabajo',tax:'IVA del recargo',confirm:'Agregar recargo',cancel:'Cancelar',saving:'Guardando…',
 none:'Este trabajo no tiene una cotización en borrador en colones. Cree una en Cotizaciones para enviar el recargo ahí.',
 sent:(t:string,v:string,d:string)=>`Recargo de ${v} enviado a la cotización "${t}" el ${d}.`,removed:(t:string)=>`La línea del recargo ya no está en la cotización "${t}". Puede enviarla de nuevo.`,
 done:'Recargo agregado a la cotización.',conflict:'La partida o la cotización cambió. Se recargó: revise e intente de nuevo.',failed:'No se pudo confirmar. Reintente la misma operación: nunca se aplica dos veces.',retry:'Reintentar la misma operación',
 lines:(n:number)=>`${n===1?'1 línea':n+' líneas'}`,loadError:'No se pudieron revisar las cotizaciones.',
}}

export function AllowanceSurcharge({accountId,workId,item,disabled}:{accountId:string;workId:string;item:AllowanceItem;disabled:boolean}){
 const en=useLocale()==='en',c=copy(en),diff=item.differenceCents??0;
 const [detail,setDetail]=useState<SurchargeDetail|null>(null),[failed,setFailed]=useState(false),[open,setOpen]=useState(false),[estimateId,setEstimateId]=useState(''),[tax,setTax]=useState(1300);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[notice,setNotice]=useState('');
 const pending=useRef<string|null>(null),active=useRef(true),sequence=useRef(0);
 const load=useCallback(async()=>{
  const id=++sequence.current;
  try{const r=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();
   const body=surchargeDetailSchema.parse(await r.json());if(body.workId!==workId)throw Error();if(active.current&&id===sequence.current){setDetail(body);setFailed(false);}return body;}
  catch{if(active.current&&id===sequence.current)setFailed(true);return null;}
 },[accountId,workId]);
 useEffect(()=>{active.current=true;const t=setTimeout(()=>void load(),0);return()=>{active.current=false;clearTimeout(t);};},[load]);
 const link=detail?.links.find(l=>l.allowanceId===item.id)??null;
 async function submit(resume=false){
  if(busy||!detail)return;
  let body=resume?pending.current:null;
  if(!body){
   const estimate=detail.estimates.find(e=>e.id===estimateId);if(!estimate)return;
   body=JSON.stringify(surchargeSendSchema.parse({action:'send_to_estimate',actionId:crypto.randomUUID(),workId,id:item.id,revision:item.revision,estimateId:estimate.id,estimateRevision:estimate.revision,lineId:crypto.randomUUID(),taxBps:tax}));
   pending.current=body;
  }
  setBusy(true);setError('');setNotice('');
  try{
   const r=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body});
   if(r.status===409||r.status===400){pending.current=null;setUncertain(false);setError(c.conflict);await load();return;}
   if(!r.ok)throw Error();
   surchargeResultSchema.parse(await r.json());pending.current=null;setUncertain(false);setOpen(false);setNotice(c.done);await load();
  }catch{setUncertain(true);setError(c.failed);}finally{if(active.current)setBusy(false);}
 }
 if(failed&&!detail)return <p role="alert" data-allowance-surcharge-error className="text-sm text-[#8a2a1b]">{c.loadError} <button type="button" className="underline" onClick={()=>void load()}>{en?'Retry':'Reintentar'}</button></p>;
 if(!detail)return null;
 if(link?.present)return <p data-allowance-surcharge="sent" className="rounded-xl bg-[#eaf5fb] p-3 text-sm text-[#0b3a53]">{c.sent(link.estimateTitle,proMoney(link.amountCents/100),stamp(link.sentAt,en))}</p>;
 return <div data-allowance-surcharge={open?'form':'idle'} className="space-y-2">
  {link&&!link.present&&<p data-allowance-surcharge="removed" className="rounded-xl bg-[#fff6e5] p-3 text-sm text-[#7a4b00]">{c.removed(link.estimateTitle)}</p>}
  {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] p-3 text-sm font-semibold text-[#18573a]">{notice}</p>}
  {error&&<div role="alert" className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{error}</p>{uncertain&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>void submit(true)}>{c.retry}</Button>}</div>}
  {!open&&<Button type="button" variant="secondary" data-allowance-surcharge-open disabled={disabled||busy} onClick={()=>{setOpen(true);setError('');setNotice('');setEstimateId(detail.estimates[0]?.id??'');}}>{c.send}</Button>}
  {open&&<div className="space-y-3 rounded-2xl border border-[#0089bb] bg-[#f7fbfd] p-4">
   <h5 className="font-bold text-[#162543]">{c.title}</h5>
   <p className="text-sm text-[#52627a]">{c.intro(proMoney(diff/100))}</p>
   {detail.estimates.length===0?<p data-allowance-surcharge-none className="text-sm font-semibold text-[#7a4b00]">{c.none}</p>:<fieldset disabled={busy} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <label className="block text-sm font-semibold">{c.estimate}<select data-allowance-surcharge-estimate value={estimateId} onChange={e=>setEstimateId(e.target.value)} className={field}>{detail.estimates.map(e=><option key={e.id} value={e.id}>{e.title+' · '+c.lines(e.lineCount)+' · '+proMoney(e.totalCents/100)}</option>)}</select></label>
    <label className="block text-sm font-semibold">{c.tax}<select data-allowance-surcharge-tax value={tax} onChange={e=>setTax(Number(e.target.value))} className={field}>{VAT.map(v=><option key={v.bp} value={v.bp}>{en?v.en:v.es}</option>)}</select></label>
   </fieldset>}
   <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={()=>{setOpen(false);setError('');pending.current=null;setUncertain(false);}}>{c.cancel}</Button>
    <Button type="button" data-allowance-surcharge-confirm disabled={busy||!estimateId||detail.estimates.length===0} onClick={()=>void submit()}>{busy?c.saving:c.confirm}</Button></div>
  </div>}
 </div>;
}
