'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {creditLedgerSchema,type CreditLedger,type CreditLedgerEvent} from '@/lib/pro/credits-retainers';

/**
 * Row 50: ledger of what the professional holds in favour of the customer (retainers, credit notes, overpayments, refunds).
 * Signed, append-only entries with a running balance. A reversal is an inverse entry; nothing is deleted. Read only.
 */
const api='/api/pro/credit-ledger';
function copy(en:boolean){return en?{
 title:'Customer credit ledger',intro:'Every movement of retainers, credit notes, overpayments and refunds, with the running balance. Reversals appear as opposite entries; nothing is deleted.',
 scopeWork:'This project',scopeClient:'Whole customer',balance:'Balance held for the customer',received:'Received or issued',applied:'Applied to invoices',refunded:'Refunded',closed:'Closed by cancellation',
 date:'Date',event:'Movement',credit:'Credit',amount:'Amount',running:'Balance',reference:'Detail',project:'Project',
 events:{received:'Received or issued',apply:'Applied to an invoice',unapply:'Application reversed',apply_void:'Application voided in invoice payments',refund:'Refund recorded',void_refund:'Refund voided',cancel:'Credit cancelled',source_reversed:'Source payment reversed'} as Record<CreditLedgerEvent,string>,
 reconciled:'The ledger matches the balance of every credit.',notReconciled:'The ledger does not match the credits. Refresh before relying on it.',
 empty:'There are no movements yet.',byWork:'Balance by project',truncated:'Showing the 200 most recent movements. The running balance includes every movement.',
 refresh:'Refresh',loading:'Loading…',loadError:'Could not load the ledger.',retry:'Retry',
}:{
 title:'Libro de créditos del cliente',intro:'Todos los movimientos de anticipos, notas de crédito, sobrepagos y reembolsos, con el saldo acumulado. Los reversos aparecen como asientos opuestos; nunca se borra nada.',
 scopeWork:'Este proyecto',scopeClient:'Todo el cliente',balance:'Saldo a favor del cliente',received:'Recibido o emitido',applied:'Aplicado a facturas',refunded:'Devuelto',closed:'Cerrado por cancelación',
 date:'Fecha',event:'Movimiento',credit:'Crédito',amount:'Monto',running:'Saldo',reference:'Detalle',project:'Proyecto',
 events:{received:'Recibido o emitido',apply:'Aplicado a una factura',unapply:'Aplicación revertida',apply_void:'Aplicación anulada en pagos de la factura',refund:'Reembolso registrado',void_refund:'Reembolso anulado',cancel:'Crédito cancelado',source_reversed:'Pago de origen revertido'} as Record<CreditLedgerEvent,string>,
 reconciled:'El libro cuadra con el saldo de cada crédito.',notReconciled:'El libro no cuadra con los créditos. Actualice antes de confiar en él.',
 empty:'Todavía no hay movimientos.',byWork:'Saldo por proyecto',truncated:'Se muestran los 200 movimientos más recientes. El saldo acumulado incluye todos.',
 refresh:'Actualizar',loading:'Cargando…',loadError:'No se pudo cargar el libro.',retry:'Reintentar',
};}

export function WorkCreditLedger({workId,accountId,refreshKey}:{workId:string;accountId:string;refreshKey:number}){
 const en=useLocale()==='en',c=copy(en);
 const [scope,setScope]=useState<'work'|'client'>('work'),[data,setData]=useState<CreditLedger|null>(null),[clientId,setClientId]=useState<string|null>(null),[failed,setFailed]=useState(false);
 const headers=useMemo(()=>({'X-Pro-Expected-Actor':accountId}),[accountId]);
 const money=useCallback((cents:number)=>proMoney(cents/100,en),[en]);
 const signed=(cents:number)=>cents<0?'−'+money(-cents):'+'+money(cents);
 const day=(iso:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(iso));
 const load=useCallback(async()=>{setFailed(false);try{
  const query:Record<string,string>=scope==='work'||!clientId?{workId}:{clientId};
  const r=await fetch(api+'?'+new URLSearchParams(query),{cache:'no-store',headers});if(!r.ok)throw Error();
  const body=creditLedgerSchema.parse(await r.json());setData(body);setClientId(body.client.id);
 }catch{setFailed(true);}},[headers,scope,clientId,workId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load,refreshKey]);
 if(!data)return failed?<div role="alert" data-credit-ledger-error className="space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{c.retry}</Button></div>
  :<p role="status" aria-busy="true" className="rounded-2xl border border-[#d7e1ea] bg-white p-4 text-sm text-[#52627a]">{c.loading}</p>;
 const stat=(id:string,label:string,value:number,strong=false)=><div data-ledger-total={id} className={`min-w-0 rounded-xl border p-3 ${strong?'border-[#9fd8ee] bg-[#eef8fc]':'border-[#d7e1ea] bg-[#f7f9fc]'}`}><dt className="text-xs font-semibold text-[#52627a]">{label}</dt><dd className="mt-1 break-words text-base font-bold tabular-nums text-[#162543]">{money(value)}</dd></div>;
 return <section data-credit-ledger={data.scope} className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1 basis-64 space-y-1"><h4 className="font-bold text-[#162543]">{c.title}</h4><p className="text-sm text-[#52627a]">{c.intro}</p></div>
   <div className="flex flex-wrap gap-2"><div role="group" aria-label={c.title} className="inline-flex rounded-xl bg-[#e9eff5] p-1">{(['work','client'] as const).map(v=><button key={v} type="button" data-ledger-scope={v} aria-pressed={scope===v} onClick={()=>setScope(v)} className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${scope===v?'bg-white text-[#162543] shadow-sm':'text-[#52627a]'}`}>{v==='work'?c.scopeWork:c.scopeClient}</button>)}</div>
    <Button type="button" size="sm" variant="ghost" onClick={()=>void load()}>{c.refresh}</Button></div></div>
  <dl className="grid grid-cols-2 gap-2 lg:grid-cols-5">{stat('balance',c.balance,data.balanceCents,true)}{stat('received',c.received,data.receivedCents)}{stat('applied',c.applied,data.appliedCents)}{stat('refunded',c.refunded,data.refundedCents)}{stat('closed',c.closed,data.closedCents)}</dl>
  <p data-ledger-reconciled={data.reconciled?'yes':'no'} className={`rounded-xl p-3 text-sm ${data.reconciled?'bg-[#eef8f4] text-[#18573a]':'bg-[#fdf3ef] text-[#a03c1f]'}`}>{data.reconciled?c.reconciled:c.notReconciled}</p>
  {data.scope==='client'&&data.byWork.length>1&&<ul data-ledger-by-work className="space-y-1 text-sm"><li className="font-semibold text-[#162543]">{c.byWork}</li>{data.byWork.map(w=><li key={w.workId} className="flex justify-between gap-3"><span className="min-w-0 break-words text-[#52627a]">{w.title??w.workId}</span><span className="tabular-nums">{money(w.balanceCents)}</span></li>)}</ul>}
  {!data.entries.length?<p data-ledger-empty className="rounded-xl border border-dashed border-[#c3cfdc] bg-[#f7f9fc] p-3 text-sm text-[#52627a]">{c.empty}</p>
   :<ul className="divide-y divide-[#eef2f6] rounded-xl border border-[#e5ebf1]">{data.entries.map(e=><li key={e.seq} data-ledger-entry={e.event} className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1 px-3 py-2.5 text-sm md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
    <div className="col-span-2 min-w-0 md:col-span-1"><p className="font-semibold text-[#162543]">{c.events[e.event]}</p><p className="break-words text-xs text-[#52627a]"><span className="font-mono">{e.code}</span> · {e.title}{data.scope==='client'&&e.workTitle?' · '+e.workTitle:''}{e.reference?' · '+e.reference:''}</p></div>
    <p className="text-xs text-[#68778d] md:text-sm">{day(e.at)}</p>
    <p className={`text-right tabular-nums font-semibold ${e.deltaCents<0?'text-[#a03c1f]':'text-[#18573a]'}`}>{signed(e.deltaCents)}</p>
    <p className="text-right tabular-nums"><span className="text-xs text-[#68778d] md:sr-only">{c.running} </span>{money(e.balanceCents)}</p></li>)}</ul>}
  {data.truncated&&<p className="text-xs text-[#52627a]">{c.truncated}</p>}
 </section>;
}
