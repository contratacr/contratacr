'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {budgetSyncResultSchema,budgetSyncSchema,type BudgetSync,type BudgetSyncMutation,type BudgetSyncSource} from '@/lib/pro/cost-codes';

/**
 * Row 54: synchronise the project budget from the accepted quote and from accepted change orders. Each source is applied once,
 * in one transaction, through the budget writer. Nothing is sent to the customer.
 */
const api='/api/pro/work-budget-sync';
function copy(en:boolean){return en?{
 title:'Sync from documents',intro:'Create budget codes from the accepted quote and from approved change orders. Each document is applied once and the codes can then be edited.',
 estimate:'Accepted quote',change:'Approved change order',apply:'Apply to budget',applied:'Applied',appliedOn:(d:string)=>`Applied on ${d}`,
 lines:(g:number,i:number)=>`${i===1?'1 line':i+' lines'}${g?` in ${g===1?'1 section':g+' sections'}`:''}`,planned:'Planned cost',sale:'Amount for the customer',
 unallocated:(m:string)=>`${m} of reductions could not be netted against an added line. Adjust it by hand in the budget.`,
 currency:'This quote is not in colones, so it cannot feed the budget.',unavailable:'This document is no longer available.',none:'There is no accepted quote or approved change order to synchronise yet.',
 confirmTitle:'Apply to the budget?',confirmText:'The codes are created in one step with their planned cost, markup and VAT. The customer is not notified.',cancel:'Cancel',
 done:(n:number)=>n===0?'Recorded. This document had no lines to add.':n===1?'1 code added to the budget.':`${n} codes added to the budget.`,
 conflict:'The budget changed or a code already exists. It was refreshed: review it and try again.',failed:'Could not confirm the change. Retry: the same request is sent again and is never applied twice.',retry:'Retry',
 loadError:'Could not load the documents.',loading:'Loading…',limit:'The budget reached 500 codes.',
}:{
 title:'Sincronizar desde documentos',intro:'Cree códigos de presupuesto desde la cotización aceptada y desde las órdenes de cambio aprobadas. Cada documento se aplica una sola vez y luego puede editar los códigos.',
 estimate:'Cotización aceptada',change:'Orden de cambio aprobada',apply:'Aplicar al presupuesto',applied:'Aplicado',appliedOn:(d:string)=>`Aplicado el ${d}`,
 lines:(g:number,i:number)=>`${i===1?'1 partida':i+' partidas'}${g?` en ${g===1?'1 sección':g+' secciones'}`:''}`,planned:'Costo previsto',sale:'Monto para el cliente',
 unallocated:(m:string)=>`${m} de reducciones no se pudo descontar de una partida agregada. Ajústelo a mano en el presupuesto.`,
 currency:'Esta cotización no está en colones, así que no puede alimentar el presupuesto.',unavailable:'Este documento ya no está disponible.',none:'Todavía no hay una cotización aceptada ni una orden de cambio aprobada para sincronizar.',
 confirmTitle:'¿Aplicar al presupuesto?',confirmText:'Los códigos se crean en un solo paso con su costo previsto, markup e IVA. No se avisa al cliente.',cancel:'Cancelar',
 done:(n:number)=>n===0?'Registrado. Este documento no tenía partidas para agregar.':n===1?'Se agregó 1 código al presupuesto.':`Se agregaron ${n} códigos al presupuesto.`,
 conflict:'El presupuesto cambió o ya existe un código. Se actualizó: revíselo e intente de nuevo.',failed:'No se pudo confirmar el cambio. Reintente: se envía la misma solicitud y nunca se aplica dos veces.',retry:'Reintentar',
 loadError:'No se pudieron cargar los documentos.',loading:'Cargando…',limit:'El presupuesto llegó a 500 códigos.',
};}

export function WorkBudgetSync({workId,accountId,writable,refreshKey,onApplied}:{workId:string;accountId:string;writable:boolean;refreshKey:number;onApplied:(message:string)=>void}){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog();
 const [data,setData]=useState<BudgetSync|null>(null),[loadError,setLoadError]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const pending=useRef<BudgetSyncMutation|null>(null),seq=useRef(0);
 const headers=useMemo(()=>({'X-Pro-Expected-Actor':accountId}),[accountId]);
 const money=useCallback((cents:number)=>proMoney(cents/100,en),[en]);
 const day=(iso:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(iso));
 const load=useCallback(async()=>{const n=++seq.current;setLoadError(false);try{const r=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers});if(!r.ok)throw Error();const body=budgetSyncSchema.parse(await r.json());if(body.work.id!==workId)throw Error();if(n===seq.current)setData(body);}catch{if(n===seq.current)setLoadError(true);}},[headers,workId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load,refreshKey]);
 async function send(input:BudgetSyncMutation){
  setBusy(true);setError('');pending.current=input;
  try{
   const r=await fetch(api,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(input)});
   if(r.status===409||r.status===400||r.status===429){pending.current=null;setUncertain(false);setError(r.status===429?c.limit:c.conflict);await load();onApplied('');return;}
   if(!r.ok)throw Error();
   const result=budgetSyncResultSchema.parse(await r.json());pending.current=null;setUncertain(false);await load();onApplied(c.done(result.created));
  }catch{setUncertain(true);setError(c.failed);}finally{setBusy(false);}
 }
 async function apply(source:BudgetSyncSource){
  if(!data)return;const answer=await confirm({title:c.confirmTitle,description:c.confirmText,confirmLabel:c.apply,cancelLabel:c.cancel});if(!answer.confirmed)return;
  await send({action:'apply',actionId:crypto.randomUUID(),workId,revision:data.budgetRevision,sourceKind:source.kind,sourceId:source.id});
 }
 if(!data)return loadError?<div role="alert" data-budget-sync-error className="space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{c.retry}</Button></div>
  :<p role="status" aria-busy="true" className="rounded-2xl border border-[#d7e1ea] bg-white p-4 text-sm text-[#52627a]">{c.loading}</p>;
 return <section data-budget-sync className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  {dialogNode}
  <div className="space-y-1"><h4 className="font-bold text-[#162543]">{c.title}</h4><p className="text-sm text-[#52627a]">{c.intro}</p></div>
  {error&&<div role="alert" data-budget-sync-alert className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f1c7b8] bg-[#fdf3ef] p-3 text-sm text-[#a03c1f]"><span className="min-w-0 break-words">{error}</span>
   {uncertain&&<Button type="button" size="sm" variant="secondary" disabled={busy} onClick={()=>{if(pending.current)void send(pending.current);}}>{c.retry}</Button>}</div>}
  {!data.sources.length?<p data-budget-sync-empty className="rounded-xl border border-dashed border-[#c3cfdc] bg-[#f7f9fc] p-3 text-sm text-[#52627a]">{c.none}</p>
   :<ul className="space-y-2">{data.sources.map(s=><li key={s.kind+s.id} data-budget-sync-source={s.kind} data-budget-sync-state={s.applied?'applied':s.reason??'pending'} className="min-w-0 space-y-2 rounded-xl border border-[#e5ebf1] p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
     <div className="min-w-0 flex-1 basis-56"><p className="text-xs font-semibold uppercase tracking-wide text-[#006e90]">{s.kind==='estimate'?c.estimate:c.change}</p><p className="break-words font-semibold text-[#162543]">{s.title??''}</p>
      <p className="text-sm text-[#52627a]">{c.lines(s.groupCount,s.itemCount)} · {c.planned} {money(s.plannedCents)} · {c.sale} {money(s.saleCents)}</p></div>
     {s.applied?<span className="shrink-0 rounded-full bg-[#eef8f4] px-3 py-1 text-xs font-semibold text-[#18573a]">{c.applied}{s.appliedAt?' · '+day(s.appliedAt):''}</span>
      :s.reason?<span className="shrink-0 text-sm text-[#a03c1f]">{s.reason==='currency'?c.currency:c.unavailable}</span>
      :<Button type="button" data-budget-sync-apply className="w-full sm:w-auto" disabled={!writable||busy} onClick={()=>void apply(s)}>{c.apply}</Button>}
    </div>
    {s.unallocatedCents>0&&<p data-budget-sync-unallocated className="rounded-lg border border-[#f2d9a0] bg-[#fff8e8] p-2 text-sm text-[#7a4b00]">{c.unallocated(money(s.unallocatedCents))}</p>}
   </li>)}</ul>}
 </section>;
}
