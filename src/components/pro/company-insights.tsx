'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {navigatePro} from '@/lib/pro/navigation';
import {insightsChecklist,insightsPages,photoTips,websiteChecks,type InsightsPage,type InsightsSite} from '@/lib/pro/insights';
import {useProSearchParams} from './use-pro-search-params';
import {CompanyAdsTracking} from './company-ads-tracking';
import {LeadOriginMetrics} from './lead-origin-metrics';
import {CompanyLeadInsights} from './company-lead-insights';

/**
 * Area E: Marketing insights with sub-pages (Online exposure, Profile and reviews, Photos, Website, Leads, Campaigns).
 * Everything is read from data ContrataCR already has (profile, published site, leads); nothing is invented. Views and photo
 * statistics are not collected by ContrataCR, so those pages say so instead of showing numbers.
 */
const card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5';
const Badge=({ok,en}:{ok:boolean;en:boolean})=><span className={'shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold '+(ok?'bg-[#e6f6ee] text-[#175b42]':'bg-[#fff6e5] text-[#8a5300]')}>{ok?(en?'Done':'Listo'):(en?'Pending':'Pendiente')}</span>;
export function CompanyInsights(){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),params=useProSearchParams();
 const requested=params.get('seccion'),page:InsightsPage=(insightsPages as readonly string[]).includes(requested??'')?requested as InsightsPage:'profile';
 const [data,setData]=useState<InsightsSite|null>(null),[failed,setFailed]=useState(false);
 const load=useCallback(async()=>{setFailed(false);try{const r=await fetch('/api/pro/site?'+new URLSearchParams({lang:en?'en':'es'}),{cache:'no-store'});if(!r.ok)throw Error();const b=await r.json();setData({profile:b.profile,site:b.site?{published:!!b.site.publishedVersion,sections:b.site.draft.sections}:null,submissions:b.submissions??0});}catch{setFailed(true);}},[en]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const names:Record<InsightsPage,[string,string]>={exposure:['Presencia en línea','Online exposure'],profile:['Perfil y reseñas','Profile and reviews'],photos:['Fotos','Photos'],website:['Sitio web','Website'],leads:['Solicitudes','Leads'],campaigns:['Campañas','Campaigns']};
 const go=(p:InsightsPage)=>navigatePro('pro_company',{empresa:'insights',seccion:p});
 const loader=failed?<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudo cargar.','Could not load.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>:!data?<p role="status" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>:null;
 const link=(label:string,tab:string,extra?:Record<string,string>)=><Button type="button" variant="secondary" className="min-h-11" onClick={()=>navigatePro('pro_company',{empresa:tab,...extra})}>{label}</Button>;
 let body:React.ReactNode;
 if(page==='campaigns')body=<CompanyAdsTracking/>;
 else if(page==='leads')body=<div className="min-w-0 space-y-4"><CompanyLeadInsights/><section className={card} data-insights-leads aria-labelledby="ins-leads"><h3 id="ins-leads" className="font-bold">{t('Solicitudes por canal','Leads by channel')}</h3><p className="text-sm text-[#52627a]">{t('Total, ganadas y canal de origen de sus solicitudes, con el período que elija.','Total, won and source channel of your leads, for the period you choose.')}</p><LeadOriginMetrics/></section></div>;
 else if(loader)body=loader;
 else{
  const d=data!,list=insightsChecklist(d,en),done=list.filter(x=>x.done).length;
  if(page==='profile')body=<section className={card} data-insights-profile aria-labelledby="ins-profile"><h3 id="ins-profile" className="font-bold">{t('Complete su perfil','Complete your profile')}</h3>
   <p data-insights-progress className="text-sm text-[#52627a]">{t(`${done} de ${list.length} pasos completos.`,`${done} of ${list.length} steps complete.`)}</p>
   <ul className="space-y-2">{list.map(x=><li key={x.key} data-insights-step={x.key} data-done={x.done} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f9fc] p-3 text-sm"><span className="min-w-0 break-words"><strong>{x.title}</strong><span className="block text-[#52627a]">{x.hint}</span></span><Badge ok={x.done} en={en}/></li>)}</ul>
   <div className="rounded-xl bg-[#f3f8fb] p-3 text-sm"><p className="font-semibold">{t('Reseñas','Reviews')}</p><p className="mt-1 text-[#52627a]">{d.profile.rating.count?t(`Tiene ${d.profile.rating.count} reseñas publicadas con promedio ${d.profile.rating.average}.`,`You have ${d.profile.rating.count} published reviews averaging ${d.profile.rating.average}.`):t('Todavía no tiene reseñas. Pida a sus clientes satisfechos que escriban una desde su perfil.','You have no reviews yet. Ask your satisfied customers to write one from your profile.')}</p>
    <div className="mt-2 flex flex-wrap gap-2">{link(t('Pedir reseñas por correo','Request reviews by email'),'correo')}</div></div></section>;
  else if(page==='photos')body=<section className={card} data-insights-photos aria-labelledby="ins-photos"><h3 id="ins-photos" className="font-bold">{t('Resumen de fotos','Photo summary')}</h3>
   {d.profile.photos.length?<><p data-insights-photo-count className="text-sm text-[#52627a]">{t(`Su perfil tiene ${d.profile.photos.length} fotos.`,`Your profile has ${d.profile.photos.length} photos.`)}</p>
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">{d.profile.photos.slice(0,12).map((url,i)=><li key={url}>
{/* eslint-disable-next-line @next/next/no-img-element -- the professional's own public profile photo */}
<img src={url} alt={t(`Foto ${i+1} de su perfil`,`Profile photo ${i+1}`)} className="aspect-square w-full rounded-lg object-cover"/></li>)}</ul></>
   :<p data-insights-photo-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-4 text-sm text-[#52627a]">{t('Muestre fotos de sus proyectos terminados en su perfil.','Show photos of your completed projects on your profile.')}</p>}
   <div><p className="text-sm font-bold">{t('Mejore la calidad de sus fotos','Improve your photo quality')}</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[#52627a]">{photoTips(en).map(x=><li key={x}>{x}</li>)}</ul></div>
   <p className="text-xs text-[#52627a]">{t('ContrataCR no mide cuántas veces se guarda o se ve cada foto, por eso no hay estadísticas por foto.','ContrataCR does not measure how often each photo is saved or viewed, so there are no per-photo statistics.')}</p>
   {link(t('Casos de éxito','Success stories'),'casos')}</section>;
  else if(page==='website')body=<section className={card} data-insights-website aria-labelledby="ins-web"><h3 id="ins-web" className="font-bold">{t('Su sitio web','Your website')}</h3>
   <ul className="space-y-2">{websiteChecks(d,en).map(x=><li key={x.key} data-insights-check={x.key} data-done={x.done} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f9fc] p-3 text-sm"><span className="min-w-0 break-words">{x.title}</span><Badge ok={x.done} en={en}/></li>)}</ul>
   <p className="text-sm text-[#52627a]">{t(`Solicitudes recibidas por el sitio: ${d.submissions}.`,`Requests received through the site: ${d.submissions}.`)}</p>{link(t('Abrir el sitio web','Open the website'),'sitio')}</section>;
  else body=<section className={card} data-insights-exposure aria-labelledby="ins-exp"><h3 id="ins-exp" className="font-bold">{t('Actividad reciente','Recent activity')}</h3>
   <ul className="grid gap-2 sm:grid-cols-3"><li className="rounded-xl bg-[#f7f9fc] p-3 text-sm"><span className="text-[#52627a]">{t('Fotos en el perfil','Profile photos')}</span><span data-insights-kpi="photos" className="block text-xl font-bold">{d.profile.photos.length}</span></li>
    <li className="rounded-xl bg-[#f7f9fc] p-3 text-sm"><span className="text-[#52627a]">{t('Reseñas publicadas','Published reviews')}</span><span data-insights-kpi="reviews" className="block text-xl font-bold">{d.profile.rating.count??0}</span></li>
    <li className="rounded-xl bg-[#f7f9fc] p-3 text-sm"><span className="text-[#52627a]">{t('Solicitudes del sitio web','Website requests')}</span><span data-insights-kpi="submissions" className="block text-xl font-bold">{d.submissions}</span></li></ul>
   {!d.profile.photos.length&&<p data-insights-quiet className="text-sm text-[#52627a]">{t('Está tranquilo por aquí. Aumente su presencia mostrando sus proyectos terminados.','It is quiet here. Increase your exposure by showing your completed projects.')}</p>}
   <p className="text-xs text-[#52627a]">{t('ContrataCR no mide visitas ni impresiones de su perfil; aquí solo se muestra lo que sí registra.','ContrataCR does not measure profile visits or impressions; only what it records is shown here.')}</p></section>;
 }
 return <div data-company-insights={page} className="min-w-0 space-y-4">
  <nav aria-label={t('Resultados de marketing','Marketing insights')} className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-[#e9eff5] p-1">{insightsPages.map(p=><button key={p} type="button" data-insights-tab={p} aria-current={page===p?'page':undefined} onClick={()=>go(p)} className={`min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${page===p?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`}>{en?names[p][1]:names[p][0]}</button>)}</nav>
  {body}
 </div>;
}
