'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {usePathname} from 'next/navigation';
import {z} from 'zod';
import {Button} from '@/components/ui/button';
import {currentProPath,navigatePro,pushProParams} from '@/lib/pro/navigation';
import {projectEstimatesPageSchema,type ProjectEstimate,type ProjectEstimateScope,type ProjectEstimatesPage,type ProjectEstimateStatus} from '@/lib/pro/project-planning';
import {PrivateEstimateAction} from './private-estimate-action';
import {privateEstimateMoney} from './private-estimate-preview';
import {proQuoteStatus} from '@/lib/pro/quote-status';
import {filterEstimates,summarizeEstimates,type EstimateFilter} from '@/lib/pro/finance-list';
import {FinanceFilters,FinanceSummaryCards,moneyList} from './finance-list-kit';

const api='/api/pro/project-planning';
function copy(en:boolean){
 return en?{
  title:'Quotes',intro:'Quotes prepared for this project and the customer’s quotes that are not assigned to any project.',
  create:'New quote for this project',cancelled:'A cancelled job does not accept new quotes.',
  project:'For this project',client:'Customer quotes without a project',
  emptyProject:'This project has no quotes yet. Create one to price the work.',
  open:'Open quote',contract:'Create contract',loading:'Loading quotes…',error:'Could not load the quotes.',retry:'Retry',more:'Show more quotes',
  states:Object.fromEntries((['draft','sent','accepted','declined','withdrawn'] as const).map(s=>[s,proQuoteStatus(s,true)])) as Record<ProjectEstimateStatus,string>,
  changesRequested:'Changes requested',unpublished:'Has changes not shared yet',agreement:'Agreement for this project',
  cards:'Quote summary',cTotal:'Total quoted',cAccepted:'Accepted',cAwaiting:'Awaiting reply',cCount:'Quotes',search:'Search quotes',filters:'Filter quotes by status',fAll:'All',fDraft:'Drafts',fSent:'Sent',fAccepted:'Accepted',fClosed:'Closed',noMatch:'No quotes match this search or filter.',loadedNote:'Totals cover the quotes shown.',
 }:{
  title:'Cotizaciones',intro:'Cotizaciones preparadas para este proyecto y las del cliente que no están asignadas a ningún proyecto.',
  create:'Nueva cotización para este proyecto',cancelled:'Un trabajo cancelado no admite cotizaciones nuevas.',
  project:'De este proyecto',client:'Del cliente, sin proyecto asignado',
  emptyProject:'Este proyecto aún no tiene cotizaciones. Cree una para presupuestar el trabajo.',
  open:'Abrir cotización',contract:'Crear contrato',loading:'Cargando cotizaciones…',error:'No se pudieron cargar las cotizaciones.',retry:'Reintentar',more:'Ver más cotizaciones',
  states:Object.fromEntries((['draft','sent','accepted','declined','withdrawn'] as const).map(s=>[s,proQuoteStatus(s,false)])) as Record<ProjectEstimateStatus,string>,
  changesRequested:'Cambios solicitados',unpublished:'Tiene cambios sin compartir',agreement:'Acuerdo de este proyecto',
  cards:'Resumen de cotizaciones',cTotal:'Total cotizado',cAccepted:'Aceptado',cAwaiting:'Esperando respuesta',cCount:'Cotizaciones',search:'Buscar cotizaciones',filters:'Filtrar cotizaciones por estado',fAll:'Todas',fDraft:'Borradores',fSent:'Enviadas',fAccepted:'Aceptadas',fClosed:'Cerradas',noMatch:'Ninguna cotización coincide con la búsqueda o el filtro.',loadedNote:'Los totales cubren las cotizaciones mostradas.',
 };
}
const badge:Record<ProjectEstimateStatus,string>={draft:'bg-[#f1f3f6] text-[#52627a]',sent:'bg-[#eaf7fb] text-[#006f93]',accepted:'bg-[#eef8f4] text-[#18573a]',declined:'bg-[#fdeeee] text-[#9b1c1c]',withdrawn:'bg-[#f1f3f6] text-[#52627a]'};

type Props={actor:string;workId:string;clientId:string;cancelled:boolean;blocked?:boolean};
export function ProjectEstimates(props:Props){
 const path=usePathname();
 // Only the independent Pro space hosts the private estimate editor.
 if(!z.string().uuid().safeParse(props.actor).success||!/\/dashboard\/pro(?:\/trabajo\/[^/]+(?:\/[a-z]+)?)?$/.test(path??''))return null;
 return <Estimates key={props.actor+':'+props.workId} {...props}/>;
}

function useScope(actor:string,workId:string,scope:ProjectEstimateScope){
 const [page,setPage]=useState<ProjectEstimatesPage|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[failedAfter,setFailedAfter]=useState<string|undefined>(),active=useRef(true),sequence=useRef(0);
 const load=useCallback(async(after?:string)=>{
  const n=++sequence.current;setLoading(true);setError(false);setFailedAfter(undefined);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({workId,scope,...after?{after}:{}}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});
   if(!response.ok)throw Error();
   const body=projectEstimatesPageSchema.parse(await response.json());if(body.workId!==workId||body.scope!==scope)throw Error();
   if(active.current&&n===sequence.current)setPage(old=>after&&old?{...body,items:[...old.items,...body.items.filter(item=>!old.items.some(prior=>prior.id===item.id))]}:body);
  }catch{if(active.current&&n===sequence.current){setError(true);setFailedAfter(after);}}
  finally{if(active.current&&n===sequence.current)setLoading(false);}
 },[actor,workId,scope]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 // «Retry» repeats the request that failed: the next page keeps the rows shown.
 return {page,loading,error,load,retry:()=>void load(failedAfter)};
}

function Estimates({actor,workId,clientId,cancelled,blocked=false}:Props){
 const en=useLocale()==='en',c=copy(en),[filter,setFilter]=useState<EstimateFilter>('all'),[query,setQuery]=useState('');
 const project=useScope(actor,workId,'project'),client=useScope(actor,workId,'client');
 const open=(estimate:ProjectEstimate)=>{if(!blocked)navigatePro('quotes',{estimacionPrivada:estimate.id,volverEstimacion:currentProPath()});};
 const row=(estimate:ProjectEstimate)=><li key={estimate.id} data-project-estimate={estimate.id} data-project-estimate-status={estimate.status} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#d7e1ea] bg-white p-3">
  <div className="min-w-0 flex-1 basis-56">
   <p className="break-words font-semibold text-[#162543]">{estimate.title}</p>
   <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#52627a]">
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge[estimate.status]}`}>{estimate.publicationStatus==='changes_requested'?c.changesRequested:c.states[estimate.status]}</span>
    <span data-project-estimate-total data-currency={estimate.currency} className="font-semibold text-[#162543]">{privateEstimateMoney(estimate.totalCents,estimate.currency,en)}</span>
   </p>
   {(estimate.agreement||estimate.unpublishedChanges)&&<p className="mt-1 text-xs text-[#52627a]">{[estimate.agreement?c.agreement:null,estimate.unpublishedChanges?c.unpublished:null].filter(Boolean).join(' · ')}</p>}
  </div>
  <div className="flex flex-wrap gap-2">
   <Button type="button" variant="secondary" disabled={blocked} onClick={()=>open(estimate)} aria-label={`${c.open}: ${estimate.title}`}>{c.open}</Button>
   {/* Round 7A: a contract starts from an accepted or shared (awaiting a reply) quote of this project. */}
   {estimate.relation==='project'&&(estimate.status==='accepted'||estimate.status==='sent')&&<Button type="button" variant="outline" data-project-estimate-contract disabled={blocked} onClick={()=>{if(!blocked)pushProParams({vistaTrabajo:'contracts',contratoCotizacion:estimate.id});}} aria-label={`${c.contract}: ${estimate.title}`}>{c.contract}</Button>}
  </div>
 </li>;
 const section=(scope:ProjectEstimateScope,state:ReturnType<typeof useScope>)=>{
  const {page,loading,error,load,retry}=state;
  if(scope==='client'&&!error&&(!page||!page.items.length))return null;
  return <section data-project-estimates-scope={scope} className="space-y-2">
   <h4 className="text-sm font-bold uppercase tracking-wide text-[#52627a]">{scope==='project'?c.project:c.client}{page?` (${page.counts[scope]})`:''}</h4>
   {error&&<div role="alert" className="space-y-2"><p className="text-sm text-red-700">{c.error}</p><Button type="button" variant="secondary" data-project-estimates-retry disabled={loading} onClick={retry}>{c.retry}</Button></div>}
   {!page&&loading&&<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>}
   {page&&!page.items.length&&scope==='project'&&<p data-project-estimates-empty className="rounded-xl border border-dashed border-[#d7e1ea] bg-white p-4 text-sm text-[#52627a]">{c.emptyProject}</p>}
   {page&&scope==='project'&&page.items.length>0&&(()=>{
    const sum=summarizeEstimates(page.items),money=(cents:number,currency:string)=>privateEstimateMoney(cents,currency as 'CRC'|'USD',en),shown=filterEstimates(page.items,filter,query);
    return <>
     <FinanceSummaryCards label={c.cards} cards={[{key:'total',label:c.cTotal,value:moneyList(sum.total,money,'-'),detail:c.loadedNote},{key:'accepted',label:c.cAccepted,value:moneyList(sum.accepted,money,'-')},{key:'awaiting',label:c.cAwaiting,value:moneyList(sum.awaiting,money,'-')},{key:'count',label:c.cCount,value:String(sum.counts.all)}]}/>
     <FinanceFilters value={filter} onChange={setFilter} query={query} onQuery={setQuery} searchLabel={c.search} groupLabel={c.filters} options={[{value:'all',label:c.fAll,count:sum.counts.all},{value:'draft',label:c.fDraft,count:sum.counts.draft},{value:'sent',label:c.fSent,count:sum.counts.sent},{value:'accepted',label:c.fAccepted,count:sum.counts.accepted},{value:'closed',label:c.fClosed,count:sum.counts.closed}]}/>
     {shown.length?<ul className="space-y-2">{shown.map(row)}</ul>:<p data-finance-no-match className="text-sm text-[#52627a]">{c.noMatch}</p>}
    </>;
   })()}
   {page&&scope==='client'&&page.items.length>0&&<ul className="space-y-2">{page.items.map(row)}</ul>}
   {page?.nextCursor&&<Button type="button" variant="secondary" disabled={loading||blocked} onClick={()=>void load(page.nextCursor!)}>{c.more}</Button>}
  </section>;
 };
 return <section data-project-estimates className="space-y-4">
  <div className="space-y-2">
   <h3 className="text-lg font-bold text-[#162543]">{c.title}</h3>
   <p className="text-sm text-[#52627a]">{c.intro}</p>
   {cancelled?<p className="text-sm text-[#52627a]">{c.cancelled}</p>:<div data-project-estimate-create><PrivateEstimateAction actor={actor} clientId={clientId} workId={workId} disabled={blocked} label={c.create}/></div>}
  </div>
  {section('project',project)}
  {section('client',client)}
 </section>;
}
