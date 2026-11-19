'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {usePathname} from 'next/navigation';
import {z} from 'zod';
import {Button} from '@/components/ui/button';
import {privateEstimatePageSchema,privateEstimateSalesPageSchema} from '@/lib/pro/private-estimates';
import {proQuoteStatus,type ProQuoteStatus} from '@/lib/pro/quote-status';
import {currentProPath,navigatePro} from '@/lib/pro/navigation';
import {privateEstimateMoney} from './private-estimate-preview';

type Props={actor:string;clientId?:string;sourceKind?:'manual'|'work';sourceId?:string;blocked?:boolean;statusClientId?:string};
export function PrivateEstimateRelated(props:Props){
 const path=usePathname();
 return z.string().uuid().safeParse(props.actor).success&&/\/dashboard\/pro(?:\/trabajo\/[^/]+(?:\/[a-z]+)?)?$/.test(path??'')?<Related key={JSON.stringify([props.actor,props.clientId,props.sourceKind,props.sourceId])} {...props}/>:null;
}
function Related({actor,clientId,sourceKind,sourceId,blocked=false,statusClientId}:Props){
 const en=useLocale()==='en',[statuses,setStatuses]=useState<Record<string,ProQuoteStatus>>({}),[page,setPage]=useState<z.infer<typeof privateEstimatePageSchema>|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),active=useRef(true),sequence=useRef(0),mutex=useRef(false);
 const load=useCallback(async(after?:string)=>{
  if(after&&mutex.current)return;const n=++sequence.current;mutex.current=true;setLoading(true);setError(false);
  try{
   const response=await fetch('/api/pro/private-estimates?'+new URLSearchParams({view:'list',...clientId?{clientId}:{},...sourceKind&&sourceId?{sourceKind,sourceId}:{},...after?{after}:{}}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});
   if(!response.ok)throw Error();const value=privateEstimatePageSchema.parse(await response.json());
   if(active.current&&n===sequence.current)setPage(old=>after&&old?{...value,items:[...old.items,...value.items.filter(row=>!old.items.some(previous=>previous.id===row.id))]}:value);
   // Round 7A: the commercial status (shared, accepted…) with the same words as Quotes, not «private draft».
   const owner=clientId??statusClientId;
   if(owner&&!after)void fetch('/api/pro/private-estimates?'+new URLSearchParams({view:'sales',status:'all',q:'',clientId:owner}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}}).then(async r=>{if(!r.ok)return;const sales=privateEstimateSalesPageSchema.parse(await r.json());if(active.current&&n===sequence.current)setStatuses(Object.fromEntries(sales.items.filter(row=>row.kind==='private_estimate').map(row=>[row.id,row.status as ProQuoteStatus])));}).catch(()=>{});
  }catch{if(active.current&&n===sequence.current)setError(true);}
  finally{if(active.current&&n===sequence.current){mutex.current=false;setLoading(false);}}
 },[actor,clientId,sourceKind,sourceId,statusClientId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;clearTimeout(timer);invalidate();};},[load,invalidate]);
 if(!loading&&!error&&!page?.items.length)return null;
 return <section data-private-estimate-related className="space-y-3"><h4 className="font-semibold">{en?'Quotes':'Cotizaciones'}</h4>{error&&<div><p role="alert" className="text-sm text-red-700">{en?'Could not load quotes.':'No se pudieron cargar las cotizaciones.'}</p><Button variant="outline" disabled={loading} onClick={()=>void load()}>{en?'Retry':'Reintentar'}</Button></div>}{page?.items.map(item=><Button key={item.id} type="button" variant="outline" disabled={blocked} data-related-estimate={item.id} className="h-auto min-h-11 w-full justify-between whitespace-normal break-words text-left" onClick={()=>navigatePro('quotes',{estimacionPrivada:item.id,volverEstimacion:currentProPath()})}><span>{item.title}{statuses[item.id]&&<span data-related-estimate-status={statuses[item.id]} className="block text-xs font-normal">{proQuoteStatus(statuses[item.id],en)}</span>}</span><span>{privateEstimateMoney(item.totalCents,item.currency,en)}</span></Button>)}{loading&&<p role="status" className="text-sm">{en?'Loading quotes…':'Cargando cotizaciones…'}</p>}{page?.nextCursor&&<Button variant="outline" disabled={loading||blocked} onClick={()=>void load(page.nextCursor!)}>{en?'More quotes':'Más cotizaciones'}</Button>}</section>;
}
