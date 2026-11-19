'use client';
import {ChevronRight} from 'lucide-react';
import {openTeamSpace} from '@/lib/pro/team-navigation';
import {proHubGroups} from '@/lib/pro/hub-sections';
import {openProModulePage,useProPlaceHub} from '@/lib/pro/place-hub-client';
import {PROFILE_NAVIGATION_ROW,PROFILE_NAVIGATION_TITLE} from '@/components/dashboard/profile-section-layout';
import {Modal} from '@/components/ui/modal';
import {useProSearchParams} from './use-pro-search-params';
import {useEffect,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
import {VisitPreparationSettings} from './visit-preparation';
import {ProGettingStarted} from './pro-getting-started';
import {navigatePro,currentProPath,pushProParams,closeProStep,PRO_BEFORE_PATH_CHANGE} from '@/lib/pro/navigation';
import {crTodayISO} from '@/lib/time-cr';
import type {AppointmentRequest} from '@/lib/pro/appointment-requests';
import {businessSchema,type Business} from '@/lib/pro/business';

export function ProTools({taskCenter=false}:{taskCenter?:boolean}={}){
 const en=useLocale()==='en',params=useProSearchParams();
 const preparation=en?'Visit preparation':'Preparar visitas';
 // Round 2: same entries as the sidebar (lib/pro/hub-sections).
 // Pending fixes round: «Mi negocio en el directorio» (menu, table reservations, place tools) when the workspace has them.
 const placeHub=useProPlaceHub(taskCenter);
 const groups=proHubGroups(en,taskCenter,placeHub).map(group=>({key:group.key,name:group.label,items:group.items.map(item=>({key:item.key,label:item.label,open:()=>item.href?openProModulePage(item.href):item.team?openTeamSpace(en):item.preparation?pushProParams({prepararVisita:'1'}):navigatePro(item.tab,item.extra)}))}));
 // Ask the embedded editor's navigation guard before leaving the step. In the independent
 // /dashboard/pro route the history traversal used by closeProStep can commit before the
 // popstate guard restores the entry, which discarded unsaved visit settings.
 const closePreparation=()=>{const params=new URLSearchParams(window.location.search);params.delete('prepararVisita');if(!window.dispatchEvent(new CustomEvent(PRO_BEFORE_PATH_CHANGE,{cancelable:true,detail:{path:window.location.pathname+'?'+params}})))return;closeProStep('prepararVisita');};
 const row=(label:string,onClick:()=>void)=><button type="button" onClick={onClick} className={PROFILE_NAVIGATION_ROW}><span className={PROFILE_NAVIGATION_TITLE}>{label}</span><span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#162543]"><ChevronRight className="h-5 w-5 text-[#94a3b8]"/></span></button>;
 return <section data-pro-tools className="space-y-6">
  {/* Round 12: first-run checklist in the independent Pro space (hides itself when complete). */}
  {taskCenter&&<ProGettingStarted/>}
  {/* Every group uses the same two-column grid and gap as the page, so the cards line up in
      columns across groups (they no longer drift between «Empresa» and «Gestión»). */}
  <nav aria-label={en?'Tools':'Herramientas'} className="grid grid-cols-1 gap-y-6">
   {groups.map(group=><section key={group.key} aria-label={group.name} data-pro-hub-group={group.key} className="space-y-2.5">
    <h2 className="px-1 text-base font-bold text-[#162543]">{group.name}</h2>
    <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 xl:grid-cols-2">{group.items.map(item=><div key={item.key} data-pro-hub-card={item.key}>{row(item.label,item.open)}</div>)}</div>
   </section>)}
  </nav>
  {params.get('prepararVisita')==='1'&&<Modal title={preparation} ariaLabel={preparation} backLabel={en?'Back':'Volver'} onClose={closePreparation} mobilePresentation="fullscreen"><VisitPreparationSettings embedded/></Modal>}
 </section>;
}
export function ProDay(){
 const t=useTranslations('ProSimple'),locale=useLocale();
 const [rows,setRows]=useState<Business['work']|null>(null),[more,setMore]=useState(false),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 const [pending,setPending]=useState<boolean|"error"|null>(null);
 const day=crTodayISO();
 useEffect(()=>{const controller=new AbortController();let active=true;
  fetch('/api/pro/agenda?'+new URLSearchParams({day,month:day.slice(0,7),mode:'day'}),{cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw Error();const body=await response.json(),work=businessSchema.shape.work.parse(body.work);if(active){setRows(work);setMore(!!body.nextCursor);setError(false);}}).catch(()=>{if(active)setError(true);});
  return()=>{active=false;controller.abort();};
 },[day,attempt]);
 const time=(value:string)=>new Intl.DateTimeFormat(locale,{timeZone:'America/Costa_Rica',hour:'numeric',minute:'2-digit'}).format(new Date(value));
 return <section data-pro-day hidden={!error&&!rows?.length&&pending!==true&&pending!=="error"} className="space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-6">
  <ProRequestsPending onState={setPending}/>
  {!!rows?.length&&<h2 className="font-semibold text-[#162543]">{t('today')}</h2>}
  {error?<div role="alert"><p>{t('failed')}</p><Button type="button" variant="secondary" onClick={()=>setAttempt(value=>value+1)}>{t('retry')}</Button></div>:rows===null?<p role="status">{t('loading')}</p>:rows.length===0?null:<div className="space-y-2">{rows.slice(0,5).map(row=><button key={row.id} type="button" onClick={()=>navigatePro('pro_agenda',{dia:day,cita:row.id,volverDia:currentProPath()})} className="block min-h-11 w-full rounded-xl border border-[#d7e1ea] p-3 text-left"><span className="block font-semibold">{row.service}</span><span className="block text-sm text-[#52627a]">{row.client} · {time(row.start)} · {t(row.cancelled?'cancelled':row.stage==='completed'?'completed':'scheduled')}</span></button>)}</div>}
  {(more||(rows?.length??0)>5)&&<p className="text-sm">{t('more')}</p>}
  {!!rows?.length&&<Button type="button" variant="secondary" onClick={()=>navigatePro('pro_agenda',{dia:day})}>{t('allWork')}</Button>}
 </section>;
}

function ProRequestsPending({onState}:{onState:(pending:boolean|"error"|null)=>void}){
 const t=useTranslations('ProSimple');
 const [rows,setRows]=useState<AppointmentRequest[]|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;const controller=new AbortController();
  fetch('/api/pro/appointment-requests?'+new URLSearchParams({view:'provider',status:'requested'}),{cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw Error();const body=await response.json();if(!Array.isArray(body.items)||!body.items.every((row:AppointmentRequest)=>row.status==='requested'&&row.side==='provider'&&typeof row.service==='string'&&typeof row.id==='string'))throw Error();if(active){setRows(body.items.slice(0,3));setError(false);onState(body.items.length>0);}}).catch(()=>{if(active){setError(true);onState("error");}});
  return()=>{active=false;controller.abort();};
 },[attempt,onState]);
 if(!error&&!rows?.length)return null;
 return <section data-pro-day-requests aria-label={t('pendingRequests')} className="space-y-2 rounded-xl border border-[#d7e1ea] p-3">
  <h3 className="font-semibold">{t('pendingRequests')}</h3>
  {error?<div role="alert"><p className="text-sm">{t('pendingError')}</p><Button type="button" variant="secondary" onClick={()=>setAttempt(value=>value+1)}>{t('retry')}</Button></div>:rows===null?<p role="status" className="text-sm">{t('pendingLoading')}</p>:rows.length===0?<p className="text-sm text-[#52627a]">{t('noPending')}</p>:<><p className="text-sm text-[#52627a]">{t('pendingHint')}</p><ul className="space-y-1 text-sm">{rows.map(row=><li key={row.id} className="break-words">{row.service} · {row.clientName}</li>)}</ul></>}
  <Button type="button" variant="secondary" onClick={()=>navigatePro('pro_agenda',{estadoCitaSolicitud:'requested'})}>{t('reviewRequests')}</Button>
 </section>;
}
