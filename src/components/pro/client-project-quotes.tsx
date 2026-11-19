'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {privateEstimateProjectQuotesSchema,type PrivateEstimateProjectQuote} from '@/lib/pro/private-estimate-publications';
import {privateEstimateMoney} from './private-estimate-preview';

const api='/api/pro/private-estimate-publications';
/**
 * Round 7A: quotes the professional shared with THIS customer for this job, on the customer's
 * project page (not opt-in: a quote is shared explicitly). «Review quote» opens that version in
 * Quotes, where the customer accepts, declines or asks for changes. Nothing is written here.
 */
export function AppointmentQuotes({requestId}:{requestId:string}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <QuotesSession key={user.id+':'+requestId} accountId={user.id} requestId={requestId}/>;
}

function QuotesSession({accountId,requestId}:{accountId:string;requestId:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [items,setItems]=useState<PrivateEstimateProjectQuote[]|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),active=useRef(true),sequence=useRef(0);
 const load=useCallback(async()=>{const id=++sequence.current;setLoading(true);setError(false);try{const response=await fetch(api+'?'+new URLSearchParams({view:'project',requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const body=privateEstimateProjectQuotesSchema.parse(await response.json());if(active.current&&id===sequence.current)setItems(body.items);}catch{if(active.current&&id===sequence.current)setError(true);}finally{if(active.current&&id===sequence.current)setLoading(false);}},[accountId,requestId]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0),counter=sequence;return()=>{active.current=false;counter.current++;clearTimeout(timer);};},[load]);
 if(error&&!items)return <div role="alert" data-client-project-quotes-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4 text-sm"><p>{t('No se pudieron cargar las cotizaciones del proyecto.','Could not load the project quotes.')}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!items||!items.length)return null;
 const status={shared:t('Pendiente de su respuesta','Waiting for your answer'),changes_requested:t('Cambios solicitados','Changes requested'),accepted:t('Aceptada','Accepted'),declined:t('Rechazada','Declined')};
 const day=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(value));
 const open=(id:string)=>window.location.assign((en?'/en':'')+'/dashboard/cotizaciones#publicacion='+id);
 return <section data-client-project-quotes className="space-y-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
  <h3 className="text-[15px] font-bold text-[#162543]">{t('Cotizaciones','Quotes')}</h3>
  <ul className="space-y-2">{items.map(item=><li key={item.publicationId} data-client-project-quote={item.publicationId} data-status={item.status} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] p-3 text-sm">
   <span className="min-w-0 flex-1 basis-48 break-words"><span className="font-semibold">{item.title}</span> · {t('versión','version')} {item.version}<span className="block text-xs text-[#52627a]">{status[item.status]} · {day(item.sharedAt)}</span></span>
   <strong>{privateEstimateMoney(item.totalCents,item.currency,en)}</strong>
   <Button type="button" variant={item.status==='shared'||item.status==='changes_requested'?'default':'outline'} className="min-h-11" onClick={()=>open(item.publicationId)}>{item.status==='shared'?t('Revisar y responder','Review and answer'):t('Ver cotización','View quote')}</Button>
  </li>)}</ul>
 </section>;
}
