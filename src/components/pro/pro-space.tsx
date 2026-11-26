'use client';

import {useEffect,useRef,type CSSProperties,type ReactNode} from 'react';
import {ProAppSupport} from './pro-app-support';
import dynamic from 'next/dynamic';
import {reconnectingImport} from '@/lib/reconnecting-import';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {ContrataCRLogo,ContrataCRMark} from '@/components/landing/landing-navbar';
import {Button} from '@/components/ui/button';
import {usePathname} from 'next/navigation';
import {backPro,proJobRoute,pushProPath,setProNavigationAccount} from '@/lib/pro/navigation';
import {documentoRecienAbierto,iniciarSeccionArriba} from '@/lib/ir-al-inicio';
import {useProSearchParams} from './use-pro-search-params';
import {useProSectionNavigation} from './use-pro-section-navigation';
import {useLocalProAccess} from './use-local-pro-access';
import {ProManagementShell} from './management-shell';
import {ProTools,ProDay} from './simple-workspace';
import {LeadFollowupSummary} from './lead-followup-summary';

function SectionLoading(){
 const en=useLocale()==='en';
 return <p role="status" aria-busy="true">{en?'Loading section…':'Cargando sección…'}</p>;
}
// Stable, module-level boundaries: visiting a section loads its code, without
// changing the existing editor lifecycle or its navigation/draft guards.
const ProWorkspace=dynamic(()=>reconnectingImport(()=>import('./pro-workspace')).then(module=>module.ProWorkspace),{loading:SectionLoading});
const SalesWorkspace=dynamic(()=>reconnectingImport(()=>import('./sales-workspace')).then(module=>module.SalesWorkspace),{loading:SectionLoading});
const CompanyFiles=dynamic(()=>reconnectingImport(()=>import('./company-files')).then(module=>module.CompanyFiles),{loading:SectionLoading});
const TimeReportView=dynamic(()=>reconnectingImport(()=>import('./time-report')).then(module=>module.TimeReportView),{loading:SectionLoading});
const NotificationCenter=dynamic(()=>reconnectingImport(()=>import('./notification-center')).then(module=>module.NotificationCenter),{loading:SectionLoading});
const TaskCenter=dynamic(()=>reconnectingImport(()=>import('./task-center')).then(module=>module.TaskCenter),{loading:SectionLoading});
const ProjectsWorkspace=dynamic(()=>reconnectingImport(()=>import('./projects-workspace')).then(module=>module.ProjectsWorkspace),{loading:SectionLoading});
const LeadsWorkspace=dynamic(()=>reconnectingImport(()=>import('./leads-workspace')).then(module=>module.LeadsWorkspace),{loading:SectionLoading});
const StatisticsPanel=dynamic(()=>reconnectingImport(()=>import('@/components/dashboard/statistics/statistics-panel')).then(module=>module.StatisticsPanel),{loading:SectionLoading});
const CompanyHub=dynamic(()=>reconnectingImport(()=>import('./company-hub')).then(module=>module.CompanyHub),{loading:SectionLoading});
const ProReports=dynamic(()=>reconnectingImport(()=>import('./pro-reports')).then(module=>module.ProReports),{loading:SectionLoading});
const LeadOriginMetrics=dynamic(()=>reconnectingImport(()=>import('./lead-origin-metrics')).then(module=>module.LeadOriginMetrics),{loading:SectionLoading});
// Gaps round (2026-11-17): «Equipo» and «Ediciones» are sections of the Pro space (same header and side menu).
const ProTeamSection=dynamic(()=>reconnectingImport(()=>import('./pro-team-section')).then(module=>module.ProTeamSection),{loading:SectionLoading});
const EditionSettings=dynamic(()=>reconnectingImport(()=>import('./edition-settings')).then(module=>module.EditionSettings),{loading:SectionLoading});

import {ProWorkspaceBanner} from './company-team';
import {RunningTimerIndicator} from './work-timer';
import {NotificationBell} from './notification-center';
import {ProQuickMenus} from './pro-quick-menus';
import {ProBlockedNavigationNotice} from './pro-blocked-navigation-notice';
import {ProTabBar} from './pro-tab-bar';
/** Titles of the Pro space sections (also the mobile section picker). */
export function proSectionLabels(en:boolean):Record<string,string>{return en?{pro_tools:'Overview',pro_company:'Company',pro_projects:'Projects',pro_files:'Company files',pro_tasks:'Tasks',pro_hours:'Timesheets',pro_notifications:'Notifications',pro_leads:'Leads',pro_agenda:'Appointments',pro_clients:'Customers',quotes:'Quotes',pro_inventory:'Products and services',pro_expenses:'Expenses',pro_payments:'Payments',statistics:'Statistics',pro_billing:'Invoice drafts',pro_team:'Team',pro_editions:'Pro edition'}:{pro_tools:'Inicio',pro_company:'Empresa',pro_projects:'Proyectos',pro_files:'Archivos de la empresa',pro_tasks:'Tareas',pro_hours:'Horas',pro_notifications:'Avisos',pro_leads:'Solicitudes',pro_agenda:'Citas',pro_clients:'Clientes',quotes:'Cotizaciones',pro_inventory:'Productos y servicios',pro_expenses:'Gastos',pro_payments:'Pagos',statistics:'Estadísticas',pro_billing:'Borradores de facturación',pro_team:'Equipo',pro_editions:'Edición de Pro'};}
export type ProSpaceProfile={actorId:string;name:string;slug:string|null;professional:boolean;callsEnabled:boolean;memberId?:string|null};
export function ProSpace({profile}:{profile:ProSpaceProfile}){
 const locale=useLocale(),en=locale==='en',{user,loading}=useAuth(),access=useLocalProAccess(user?.id),params=useProSearchParams(),sameAccount=!!user&&(user.id===profile.actorId||!!profile.memberId&&user.id===profile.memberId);
 const labels=proSectionLabels(en);
 const requested=params.get('tab')||'pro_tools',tab=Object.hasOwn(labels,requested)?requested:'pro_tools';

 // Round 9: on the job's own route the job page brings its own title and back arrow.
 const jobRoute=!!proJobRoute(usePathname()??'');
 useEffect(()=>{setProNavigationAccount(user?.id??null);return()=>setProNavigationAccount(null);},[user?.id]);
 const navigating=useProSectionNavigation(user?.id);
 // The section a fresh document opens on already starts at the top (see documentoRecienAbierto).
 const firstSection=useRef(true);
 useEffect(()=>{const first=firstSection.current;firstSection.current=false;if(first&&documentoRecienAbierto())return;iniciarSeccionArriba();},[tab]);

 if(loading||sameAccount&&!access.ready&&!access.error)return <main className="p-6" role="status" aria-busy="true">{en?'Loading Pro…':'Cargando Pro…'}</main>;
 if(!sameAccount||!access.enabled)return <main className="space-y-4 p-6"><p role="alert">{access.error?(en?'Could not verify Pro access. Your data is preserved.':'No se pudo comprobar el acceso a Pro. Sus datos se conservan.'):(en?'Pro access is unavailable for this session.':'Pro no está disponible para esta sesión.')}</p>{access.error&&<Button onClick={access.retry}>{en?'Retry':'Reintentar'}</Button>}<Button variant="secondary" onClick={()=>window.location.assign((en?'/en':'')+'/dashboard/profesional')}>{en?'Back to My panel':'Volver a Mi panel'}</Button></main>;
 return <ProFrame tab={tab} labels={labels} subtitle={profile.name} navigating={navigating} jobRoute={jobRoute}>
    {tab==='pro_tools'&&<div className="space-y-6"><LeadFollowupSummary/><ProDay/><ProTools taskCenter/></div>}
    {(['pro_agenda','pro_clients','pro_inventory','pro_expenses'].includes(tab))&&<ProWorkspace key={user.id+':'+tab} server embedded section={tab==='pro_agenda'?'Agenda':tab==='pro_clients'?'Clientes':tab==='pro_inventory'?'Inventario':'Gastos'}/>}
    {['quotes','pro_payments','pro_billing'].includes(tab)&&<SalesWorkspace proName={profile.name} proSlug={profile.slug} puedeCrear={profile.professional} privateEstimates disabled={navigating}/>}
    {tab==='pro_projects'&&<ProjectsWorkspace key={user.id} disabled={navigating}/>}{tab==='pro_tasks'&&<TaskCenter key={user.id}/>}{tab==='pro_hours'&&<TimeReportView key={user.id}/>}{tab==='pro_notifications'&&<NotificationCenter key={user.id}/>}{tab==='pro_leads'&&<LeadsWorkspace key={user.id} headerActionsId="pro-lead-actions" disabled={navigating} profileSlug={profile.slug}/>}
    {tab==='pro_company'&&<CompanyHub key={user.id} profileSlug={profile.slug} disabled={navigating}/>}
    {tab==='pro_files'&&<CompanyFiles key={user.id} headerActionsId="pro-company-file-actions" disabled={navigating}/>}
    {tab==='statistics'&&<div className="space-y-6"><ProReports/><LeadOriginMetrics/><StatisticsPanel professional={profile.professional} callsEnabled={profile.callsEnabled}/></div>}
    {tab==='pro_team'&&<ProTeamSection key={user.id} accountId={user.id}/>}
    {tab==='pro_editions'&&<EditionSettings key={user.id}/>}
 </ProFrame>;
}

/** The Pro space chrome (header, section title, mobile Pro tab bar and side menu). Shared by the Pro
 * document and the team page (/dashboard/pro/equipo) so «Equipo» never looks like another site. */
export function ProFrame({tab,labels,subtitle,navigating,jobRoute=false,children}:{tab:string;labels:Record<string,string>;subtitle?:string;navigating:boolean;jobRoute?:boolean;children:ReactNode}){
 const en=useLocale()==='en',base=(en?'/en':'')+'/dashboard/pro';
 const exit=()=>pushProPath((en?'/en':'')+'/dashboard/profesional?tab=home');
 return <div data-independent-pro className="flex min-h-screen flex-col bg-[#f7f9fc] text-[#162543]">
  {/* Mobile (2026-11-26): one header row at 390 px (symbol + «Pro» + the five icons); a running timer takes its own row.
      The only way back is the button next to the section title. */}
  <header style={{paddingTop:"var(--ccr-safe-top, env(safe-area-inset-top))"}} className="border-b border-[#e5e7eb] bg-white"><div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6 sm:py-4">
   <div className="flex shrink-0 items-center gap-2 sm:gap-3"><ContrataCRMark className="sm:hidden"/><span className="hidden sm:inline-flex"><ContrataCRLogo/></span><span className="rounded-lg bg-[#eaf7fb] px-2 py-1 text-sm font-bold text-[#008bb5]">Pro</span></div>
   <div className="order-last w-full empty:hidden lg:order-none lg:ml-auto lg:w-auto"><RunningTimerIndicator/></div>
   <div className="flex items-center gap-1 sm:gap-2"><ProQuickMenus/><NotificationBell/><ProBlockedNavigationNotice/></div>
  </div></header>
  {/* Gaps round: one content width at 1440 px for the hub, its sections and the job page (was 80rem vs 90rem). */}
  {/* Below lg the Pro tab bar is fixed at the bottom: the page reserves its height (and the safe area). */}
  <main style={jobRoute?undefined:{'--ccr-pro-tab-bar':'calc(4.5rem + env(safe-area-inset-bottom, 0px))'} as CSSProperties} className={'mx-auto w-full max-w-[90rem] flex-1 space-y-5 px-4 py-5 sm:px-6'+(jobRoute?'':' max-lg:pb-[calc(var(--ccr-pro-tab-bar)+1.25rem)]')}>
   <ProWorkspaceBanner/>
   <ProAppSupport/>
   {!jobRoute&&<><div className="flex flex-wrap items-center justify-between gap-3"><div>{subtitle&&<p className="text-sm text-[#52627a]">{subtitle}</p>}<div className="flex items-center gap-3"><h1 className="text-2xl font-bold">{labels[tab]}</h1>{tab==='pro_files'&&<div id="pro-company-file-actions" className="h-11 w-11 shrink-0"/>}{tab==='pro_leads'&&<div id="pro-lead-actions" className="h-11 w-11 shrink-0"/>}{tab==='quotes'&&<div id="pro-estimate-actions" className="h-11 w-11 shrink-0"/>}</div></div>
    {/* One way back, like Houzz Pro: a section goes back to Inicio, Inicio goes back to Mi panel. */}
    {tab==='pro_tools'?<Button data-pro-space-back variant="secondary" disabled={navigating} onClick={exit}>{en?'Back to My panel':'Volver a Mi panel'}</Button>:<Button data-pro-space-back variant="secondary" disabled={navigating} onClick={()=>backPro(base)}>{en?'Back':'Volver'}</Button>}
   </div></>}
   {navigating&&<p data-pro-transition role="status" aria-live="polite" style={{top:'calc(var(--ccr-safe-top, 0px) + 1rem)'}} className="fixed left-1/2 z-[110] -translate-x-1/2 rounded-xl border border-[#d7e1ea] bg-white px-4 py-3 text-sm font-semibold shadow-sm">{en?'Opening section…':'Abriendo sección…'}</p>}
   <div data-pro-section-content inert={navigating} aria-busy={navigating}>
   <ProManagementShell enabled={!jobRoute} taskCenter activeTab={tab}>
    {children}
   </ProManagementShell>
   </div>
  </main>
  {!jobRoute&&<ProTabBar tab={tab} navigating={navigating}/>}
 </div>;
}
