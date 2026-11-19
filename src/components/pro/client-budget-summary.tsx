'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {clientBudgetSummarySchema,type ClientBudgetSummary} from '@/lib/pro/cost-codes';

/**
 * Row 54 (Ronda F1-B), customer side: the budget summary the professional shared explicitly (groups and sale
 * totals only). Renders nothing while loading, when nothing is shared or the request is not confirmed; a failed
 * read shows an error with a retry instead of silently hiding the section.
 */
const api='/api/pro/work-budget-forecast';
function copy(en:boolean){return en?{title:'Project budget',intro:'Summary shared by your professional. Amounts are sale prices; VAT is shown separately.',other:'Other work',subtotal:'Subtotal',vat:'VAT',total:'Total',
 shared:(d:string)=>`Shared on ${d}`,error:'Could not load the project budget.',retry:'Retry'}
 :{title:'Presupuesto del proyecto',intro:'Resumen que compartió su profesional. Los montos son precios de venta; el IVA se muestra aparte.',other:'Otros trabajos',subtotal:'Subtotal',vat:'IVA',total:'Total',
 shared:(d:string)=>`Compartido el ${d}`,error:'No se pudo cargar el presupuesto del proyecto.',retry:'Reintentar'};}

export function AppointmentBudgetSummary({requestId}:{requestId:string}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <BudgetSummarySession key={user.id+':'+requestId} accountId={user.id} requestId={requestId}/>;
}
function BudgetSummarySession({accountId,requestId}:{accountId:string;requestId:string}){
 const en=useLocale()==='en',c=copy(en),money=(cents:number)=>proMoney(cents/100,en);
 const [view,setView]=useState<ClientBudgetSummary|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),active=useRef(true),sequence=useRef(0);
 const load=useCallback(async()=>{const id=++sequence.current;setLoading(true);setError(false);
  try{const r=await fetch(api+'?'+new URLSearchParams({requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});
   if(r.status===404){if(active.current&&id===sequence.current)setView({visible:false});return;}if(!r.ok)throw Error();
   const body=clientBudgetSummarySchema.parse(await r.json());if(active.current&&id===sequence.current)setView(body);}
  catch{if(active.current&&id===sequence.current)setError(true);}finally{if(active.current&&id===sequence.current)setLoading(false);}},[accountId,requestId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 if(error)return <div role="alert" data-client-budget-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{c.error}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{c.retry}</Button></div>;
 if(!view||!view.visible)return null;
 const day=new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(view.sharedAt));
 return <section data-client-budget aria-label={c.title} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-bold text-[#162543]">{c.title}</h3><span className="text-xs text-[#52627a]">{c.shared(day)}</span></div>
  <p className="text-sm text-[#52627a]">{c.intro}</p>
  <dl className="divide-y divide-[#eef2f6] overflow-hidden rounded-xl border border-[#e5ebf1] text-sm">
   {view.groups.map(g=><div key={g.code} data-client-budget-group={g.code} className="flex items-baseline justify-between gap-3 px-3 py-2.5"><dt className="min-w-0 break-words text-[#162543]">{g.title}</dt><dd className="shrink-0 tabular-nums">{money(g.saleCents)}</dd></div>)}
   {view.otherSaleCents!==null&&<div className="flex items-baseline justify-between gap-3 px-3 py-2.5"><dt className="text-[#162543]">{c.other}</dt><dd className="shrink-0 tabular-nums">{money(view.otherSaleCents)}</dd></div>}
   <div className="flex items-baseline justify-between gap-3 px-3 py-2 text-[#52627a]"><dt>{c.subtotal}</dt><dd data-client-budget-subtotal className="shrink-0 tabular-nums">{money(view.saleCents)}</dd></div>
   <div className="flex items-baseline justify-between gap-3 px-3 py-2 text-[#52627a]"><dt>{c.vat}</dt><dd data-client-budget-vat className="shrink-0 tabular-nums">{money(view.taxCents)}</dd></div>
   <div className="flex items-baseline justify-between gap-3 bg-[#f2f6fa] px-3 py-3 font-bold text-[#162543]"><dt>{c.total}</dt><dd data-client-budget-total className="shrink-0 tabular-nums">{money(view.totalCents)}</dd></div>
  </dl>
 </section>;
}
