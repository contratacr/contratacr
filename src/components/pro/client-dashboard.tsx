'use client';

import {WorkClientInvite} from './work-client-invite';
import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {
 CLIENT_DASHBOARD_WELCOME_MAX,appointmentDashboardSchema,clientDashboardDetailSchema,clientDashboardMutationSchema,clientDashboardResultSchema,
 normalizeWelcomeText,type AppointmentDashboard,type ClientDashboardDetail,type ClientDashboardMutation,type ClientDashboardSettings,
} from '@/lib/pro/client-dashboard';
import {useProChildGuard} from './use-pro-child-guard';

const api='/api/pro/client-dashboard',changedEvent='contratacr:client-dashboard-changed';
type StateCallback={onStateChange?:(state:{dirty:boolean;busy:boolean})=>void};
type SectionKey='showUpdates'|'showDailyLogs'|'showFiles'|'showFinances'|'showPaymentPlan'|'showAllowances'|'showSelections'|'showSchedule'|'showPunchlist'|'showContracts'|'showMoodBoards';
// Allowances (family 75) and selections (family 62) are opt-in: off unless the owner turns them on.
const sectionKeys:SectionKey[]=['showUpdates','showDailyLogs','showFiles','showFinances','showPaymentPlan','showAllowances','showSelections','showSchedule','showPunchlist','showContracts','showMoodBoards'];
const sectionDefault:Record<SectionKey,boolean>={showUpdates:true,showDailyLogs:true,showFiles:true,showFinances:false,showPaymentPlan:false,showAllowances:false,showSelections:false,showSchedule:false,showPunchlist:false,showContracts:false,showMoodBoards:false};
type Draft={showUpdates:boolean;showDailyLogs:boolean;showFiles:boolean;showFinances:boolean;showPaymentPlan:boolean;showAllowances:boolean;showSelections:boolean;showSchedule:boolean;showPunchlist:boolean;showContracts:boolean;showMoodBoards:boolean;welcome:string};
const toDraft=(value:ClientDashboardSettings):Draft=>({showUpdates:value.showUpdates,showDailyLogs:value.showDailyLogs,showFiles:value.showFiles,showFinances:value.showFinances,showPaymentPlan:value.showPaymentPlan,showAllowances:value.showAllowances,showSelections:value.showSelections,showSchedule:value.showSchedule,showPunchlist:value.showPunchlist,showContracts:value.showContracts,showMoodBoards:value.showMoodBoards,welcome:value.welcomeText??''});
const sameDraft=(a:Draft,b:Draft)=>sectionKeys.every(key=>a[key]===b[key])&&normalizeWelcomeText(a.welcome)===normalizeWelcomeText(b.welcome);
const date=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));

function copy(en:boolean){
 return en?{
  title:'Customer view',intro:'Choose what your customer sees about this job in My projects. Hiding a section only changes this view; anything already shared keeps its own access.',
  sections:'Sections',showUpdates:'Job updates',showDailyLogs:'Daily summaries',showFiles:'Shared files and photos',showPaymentPlan:'Payment plan',paymentPlanHelp:'Off by default. Shows your payment plan for this job (installments, due dates and what was paid) so your customer can accept it. Internal notes and invoice drafts are never shown.',showFinances:'Finances',financesHelp:'Off by default. Shows the shared quotes, the invoices, the payments received and the balance of this job, calculated like your account statement. Internal costs and margins are never shown.',showAllowances:'Allowances',allowancesHelp:'Off by default. Shows each allowance, its status and, once defined, the choice and the difference. Internal notes are never shown.',showSelections:'Selections',selectionsHelp:'Off by default. Shows only the items you publish, with their options, so your customer can approve one or ask for changes. Internal notes are never shown.',showSchedule:'Schedule',scheduleHelp:'Off by default. Shows phases with their dates and progress, and the key dates. Task names, notes, responsible people and baselines are never shown.',showPunchlist:'Punch list',punchlistHelp:'Off by default. Shows each closing item with its status, due date and photo. Notes and responsible people are never shown.',showContracts:'Contracts',contractsHelp:'Off by default. Shows only the contracts you share, as they were when shared, so your customer can accept them (typed name, date and version) or decline them. It is not a certified digital signature.',showMoodBoards:'Idea boards',moodBoardsHelp:'Off by default. Shows only the boards you share, as they were when shared, and lets your customer comment. Later edits stay private until you share again.',
  always:'Always visible because they can need an answer from your customer: quotes, extras and changes, and the completion report.',
  welcome:'Welcome message (optional)',welcomeHelp:'Shown at the top of the customer view. Use it to greet the customer or explain the next steps.',
  save:'Save customer view',saving:'Saving…',cancel:'Discard changes',preview:'Preview',hidePreview:'Hide preview',
  previewTitle:'What your customer sees',previewEmpty:'Only quotes, extras and changes, and the completion report will be shown.',previewReadOnly:'Read-only preview with the same information your linked customer sees in My projects. Buttons are disabled: nothing is sent or changed.',previewUnsaved:'The preview shows the saved settings. Save your changes to see them here.',previewNoClient:'The preview with real information is available once a customer with an account is linked. Until then, these sections would be shown:',noRecipient:'There is no confirmed customer with an account linked to this job yet. Your settings apply as soon as one is linked; you can invite them below.',
  recipient:(name:string)=>`Linked customer: ${name}`,saved:'Customer view saved.',loading:'Loading customer view…',loadError:'Could not load the customer view.',retry:'Retry',
  conflict:'The customer view changed in another window. Reload it before saving again.',reload:'Reload',uncertain:'We could not confirm whether it was saved. Retry the same operation; it will not be applied twice.',retrySame:'Retry the same save',
  failed:'Could not save the customer view.',history:'Change history',historyEmpty:'No changes yet. The basic sections (updates, daily summaries and shared files) are visible by default; the others start hidden until you turn them on.',leave:'Save or discard the customer view changes before leaving.',
  on:'Visible',off:'Hidden',welcomeChanged:'Message updated',welcomeRemoved:'Message removed',created:'First settings',chars:(n:number)=>`${n}/${CLIENT_DASHBOARD_WELCOME_MAX}`,
 }:{
  title:'Vista del cliente',intro:'Elija qué ve su cliente de este trabajo en Mis proyectos. Ocultar una sección solo cambia esta vista; lo que ya compartió conserva su propio acceso.',
  sections:'Secciones',showUpdates:'Avances del trabajo',showDailyLogs:'Resúmenes del día',showFiles:'Archivos y fotos compartidos',showPaymentPlan:'Plan de pagos',paymentPlanHelp:'Apagada por defecto. Muestra su plan de pagos de este trabajo (cuotas, vencimientos y lo abonado) para que su cliente lo acepte. Nunca muestra notas internas ni borradores de factura.',showFinances:'Finanzas',financesHelp:'Apagada por defecto. Muestra las cotizaciones compartidas, las facturas, los abonos recibidos y el saldo de este trabajo, calculado igual que su estado de cuenta. Nunca muestra costos internos ni márgenes.',showAllowances:'Montos previstos',allowancesHelp:'Apagada por defecto. Muestra cada monto previsto, su estado y, cuando está definido, lo elegido y la diferencia. Nunca muestra las notas internas.',showSelections:'Selecciones',selectionsHelp:'Apagada por defecto. Muestra solo los ítems que usted publique, con sus opciones, para que su cliente apruebe una o pida cambios. Nunca muestra las notas internas.',showSchedule:'Cronograma',scheduleHelp:'Apagada por defecto. Muestra las fases con sus fechas y avance, y las fechas clave. Nunca muestra los nombres de las tareas, las notas, los responsables ni las líneas base.',showPunchlist:'Pendientes finales',punchlistHelp:'Apagada por defecto. Muestra cada detalle de cierre con su estado, fecha límite y foto. Nunca muestra las notas ni los responsables.',showContracts:'Contratos',contractsHelp:'Apagada por defecto. Muestra solo los contratos que usted comparta, tal como estaban al compartirlos, para que su cliente los acepte (nombre escrito, fecha y versión) o los rechace. No es una firma digital certificada.',showMoodBoards:'Tableros de ideas',moodBoardsHelp:'Apagada por defecto. Muestra solo los tableros que usted comparta, tal como estaban al compartirlos, y permite que su cliente comente. Lo que edite después queda privado hasta que vuelva a compartir.',
  always:'Siempre visibles porque pueden requerir una respuesta de su cliente: cotizaciones, extras y cambios, y la constancia final.',
  welcome:'Mensaje de bienvenida (opcional)',welcomeHelp:'Aparece arriba en la vista del cliente. Úselo para saludar o explicar los próximos pasos.',
  save:'Guardar vista del cliente',saving:'Guardando…',cancel:'Descartar cambios',preview:'Vista previa',hidePreview:'Ocultar vista previa',
  previewTitle:'Lo que verá su cliente',previewEmpty:'Solo se mostrarán cotizaciones, extras y cambios, y la constancia final.',previewReadOnly:'Vista previa de solo lectura con la misma información que su cliente vinculado ve en Mis proyectos. Los botones están desactivados: no se envía ni se cambia nada.',previewUnsaved:'La vista previa muestra la configuración guardada. Guarde sus cambios para verlos aquí.',previewNoClient:'La vista previa con información real está disponible cuando haya un cliente con cuenta vinculado. Mientras tanto, se mostrarían estas secciones:',noRecipient:'Todavía no hay un cliente confirmado con cuenta vinculado a este trabajo. La configuración se aplica en cuanto se vincule; puede invitarlo abajo.',
  recipient:(name:string)=>`Cliente vinculado: ${name}`,saved:'Vista del cliente guardada.',loading:'Cargando vista del cliente…',loadError:'No se pudo cargar la vista del cliente.',retry:'Reintentar',
  conflict:'La vista del cliente cambió en otra ventana. Recárguela antes de volver a guardar.',reload:'Recargar',uncertain:'No pudimos confirmar si se guardó. Reintente la misma operación; no se aplicará dos veces.',retrySame:'Reintentar el mismo guardado',
  failed:'No se pudo guardar la vista del cliente.',history:'Historial de cambios',historyEmpty:'Aún no hay cambios. Las secciones básicas (avances, resúmenes del día y archivos compartidos) se muestran por defecto; las demás empiezan ocultas hasta que usted las encienda.',leave:'Guarde o descarte los cambios de la vista del cliente antes de salir.',
  on:'Visible',off:'Oculta',welcomeChanged:'Mensaje actualizado',welcomeRemoved:'Mensaje retirado',created:'Primera configuración',chars:(n:number)=>`${n}/${CLIENT_DASHBOARD_WELCOME_MAX}`,
 };
}

/** Owner editor inside the job workspace. */
export function ClientDashboardEditor({workId,onStateChange,renderPreview}:{workId:string;renderPreview?:(requestId:string)=>ReactNode}&StateCallback){const {user,loading}=useAuth();if(loading||!user)return null;return <EditorSession key={user.id+':'+workId} accountId={user.id} workId={workId} onStateChange={onStateChange} renderPreview={renderPreview}/>;}

function EditorSession({accountId,workId,onStateChange,renderPreview}:{accountId:string;workId:string;renderPreview?:(requestId:string)=>ReactNode}&StateCallback){
 const en=useLocale()==='en',c=copy(en);
 const [detail,setDetail]=useState<ClientDashboardDetail|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
 const [draft,setDraft]=useState<Draft|null>(null),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[preview,setPreview]=useState(false);
 const active=useRef(true),sequence=useRef(0),pending=useRef<ClientDashboardMutation|null>(null),lock=useRef(false);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 const baseline=detail?toDraft(detail.settings):null,dirty=!!draft&&!!baseline&&!sameDraft(draft,baseline),busy=saving||uncertain;
 useProChildGuard(!onStateChange&&(dirty||busy),useCallback(()=>setError(c.leave),[c.leave]));
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});return()=>onStateChange?.({dirty:false,busy:false});},[dirty,busy,onStateChange]);
 const load=useCallback(async(keepDraft=false)=>{
  const id=++sequence.current;setLoading(true);setLoadError(false);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=clientDashboardDetailSchema.parse(await response.json());if(body.settings.workId!==workId)throw Error();
   if(active.current&&id===sequence.current){setDetail(body);if(!keepDraft)setDraft(toDraft(body.settings));setConflict(false);}
  }catch{if(active.current&&id===sequence.current)setLoadError(true);}
  finally{if(active.current&&id===sequence.current)setLoading(false);}
 },[accountId,workId]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);const refresh=(event:Event)=>{const value=(event as CustomEvent<{accountId:string;workId:string}>).detail;if(value?.accountId===accountId&&value.workId===workId&&!lock.current)void load(true);};window.addEventListener(changedEvent,refresh);return()=>{active.current=false;invalidate();clearTimeout(timer);window.removeEventListener(changedEvent,refresh);};},[accountId,workId,load,invalidate]);

 async function send(input:ClientDashboardMutation){
  if(lock.current)return;lock.current=true;pending.current=input;setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(input)});
   if(response.status===409){pending.current=null;setUncertain(false);setConflict(true);setError(c.conflict);return;}
   if(response.status>=500||response.status===429){setUncertain(true);setError(c.uncertain);return;}
   if(!response.ok){pending.current=null;setUncertain(false);setError(c.failed);return;}
   const body=clientDashboardResultSchema.parse(await response.json());if(body.settings.workId!==workId)throw Error();
   pending.current=null;setUncertain(false);
   if(active.current){setDraft(toDraft(body.settings));setNotice(c.saved);}
   window.dispatchEvent(new CustomEvent(changedEvent,{detail:{accountId,workId}}));
   lock.current=false;await load();return;
  }catch{setUncertain(true);setError(c.uncertain);}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 function save(){
  if(!draft||!detail||!dirty||busy)return;
  const input=clientDashboardMutationSchema.parse({workId,actionId:crypto.randomUUID(),revision:detail.settings.revision,showUpdates:draft.showUpdates,showDailyLogs:draft.showDailyLogs,showFiles:draft.showFiles,showFinances:draft.showFinances,showPaymentPlan:draft.showPaymentPlan,showAllowances:draft.showAllowances,showSelections:draft.showSelections,showSchedule:draft.showSchedule,showPunchlist:draft.showPunchlist,showContracts:draft.showContracts,showMoodBoards:draft.showMoodBoards,welcomeText:normalizeWelcomeText(draft.welcome)});
  void send(input);
 }
 function change(next:Partial<Draft>){setDraft(old=>old?{...old,...next}:old);setNotice('');if(!uncertain)setError('');}

 if(loading&&!detail)return <p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 if(!detail||!draft)return <div role="alert" className="space-y-2"><p className="text-sm">{c.loadError}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{c.retry}</Button></div>;
 const visibleSections=sectionKeys.filter(key=>draft[key]),welcome=normalizeWelcomeText(draft.welcome);
 return <section data-client-dashboard-editor className="space-y-5">
  <div><h3 className="text-lg font-bold">{c.title}</h3><p className="mt-1 text-sm text-[#52627a]">{c.intro}</p>
   <p data-client-dashboard-recipient className="mt-2 text-sm">{detail.recipientName?c.recipient(detail.recipientName):c.noRecipient}</p></div>
  <WorkClientInvite workId={workId}/>
  {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
  {loadError&&<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" disabled={loading||saving} onClick={()=>void load(dirty)}>{c.retry}</Button></div>}
  {error&&<div role="alert" className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{error}</p>
   {uncertain&&<Button type="button" variant="secondary" disabled={saving} onClick={()=>pending.current&&void send(pending.current)}>{c.retrySame}</Button>}
   {conflict&&<Button type="button" variant="secondary" disabled={loading||saving} onClick={()=>void load()}>{c.reload}</Button>}</div>}
  <fieldset disabled={busy||conflict} className="space-y-3 rounded-xl border border-[#d7e1ea] p-4">
   <legend className="px-1 font-semibold">{c.sections}</legend>
   {sectionKeys.map(key=><label key={key} className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
    <span className="min-w-0">{c[key]}{key==='showFinances'&&<span className="mt-0.5 block text-xs font-normal text-[#52627a]">{c.financesHelp}</span>}{key==='showPaymentPlan'&&<span className="mt-0.5 block text-xs font-normal text-[#52627a]">{c.paymentPlanHelp}</span>}{key==='showAllowances'&&<span className="mt-0.5 block text-xs font-normal text-[#52627a]">{c.allowancesHelp}</span>}{key==='showSelections'&&<span className="mt-0.5 block text-xs font-normal text-[#52627a]">{c.selectionsHelp}</span>}{key==='showSchedule'&&<span className="mt-0.5 block text-xs font-normal text-[#52627a]">{c.scheduleHelp}</span>}{key==='showPunchlist'&&<span className="mt-0.5 block text-xs font-normal text-[#52627a]">{c.punchlistHelp}</span>}{key==='showContracts'&&<span className="mt-0.5 block text-xs font-normal text-[#52627a]">{c.contractsHelp}</span>}{key==='showMoodBoards'&&<span className="mt-0.5 block text-xs font-normal text-[#52627a]">{c.moodBoardsHelp}</span>}</span>
    <span className="flex shrink-0 items-center gap-2 font-normal text-[#52627a]">{draft[key]?c.on:c.off}<input type="checkbox" role="switch" aria-checked={draft[key]} data-client-dashboard-section={key} className="h-5 w-5 accent-[#0089bb]" checked={draft[key]} onChange={event=>{const next:Partial<Draft>={};next[key]=event.target.checked;change(next);}}/></span>
   </label>)}
   <p className="text-xs text-[#52627a]">{c.always}</p>
  </fieldset>
  <label className="block text-sm font-semibold">{c.welcome}
   <textarea data-client-dashboard-welcome disabled={busy||conflict} maxLength={CLIENT_DASHBOARD_WELCOME_MAX} rows={4} value={draft.welcome} onChange={event=>change({welcome:event.target.value})} className="mt-1 block w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal"/>
   <span className="mt-1 flex justify-between gap-3 text-xs font-normal text-[#52627a]"><span>{c.welcomeHelp}</span><span>{c.chars(draft.welcome.length)}</span></span>
  </label>
  <div className="flex flex-wrap justify-end gap-2">
   <Button type="button" variant="secondary" aria-expanded={preview} onClick={()=>setPreview(value=>!value)}>{preview?c.hidePreview:c.preview}</Button>
   {dirty&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>{setDraft(baseline);setError('');setConflict(false);}}>{c.cancel}</Button>}
   <Button type="button" disabled={!dirty||busy||conflict} onClick={save}>{saving?c.saving:c.save}</Button>
  </div>
  {preview&&<div data-client-dashboard-preview className="min-w-0 space-y-3 rounded-2xl border border-dashed border-[#0089bb] bg-[#f7fbfd] p-4">
   <p className="text-xs font-semibold uppercase tracking-wide text-[#0089bb]">{c.previewTitle}</p>
   {detail.previewRequestId&&renderPreview?<>
    <p data-client-preview-note className="text-sm text-[#52627a]">{c.previewReadOnly}</p>
    {dirty&&<p data-client-preview-unsaved role="status" className="rounded-xl bg-[#fff8e6] p-3 text-sm text-[#6b4e00]">{c.previewUnsaved}</p>}
    {/* Same customer components and readers; disabled controls and no link navigation: nothing is done for the customer. */}
    <fieldset disabled data-client-preview-live className="min-w-0 space-y-4" onClickCapture={event=>{if((event.target as HTMLElement).closest('a'))event.preventDefault();}}>
     <legend className="sr-only">{c.previewTitle}</legend>
     {/* Remounted on every saved revision so the customer readers load the new settings. */}
     <div key={detail.settings.revision} className="min-w-0 space-y-4">{renderPreview(detail.previewRequestId)}</div>
    </fieldset>
   </>:<>
    <p data-client-preview-no-client className="text-sm text-[#52627a]">{c.previewNoClient}</p>
    {welcome&&<ClientWelcome text={welcome} en={en}/>}
    {visibleSections.length?<ul className="list-disc space-y-1 pl-5 text-sm">{visibleSections.map(key=><li key={key}>{c[key]}</li>)}</ul>:<p className="text-sm text-[#52627a]">{c.previewEmpty}</p>}
   </>}
  </div>}
  <section className="space-y-2"><h4 className="font-semibold">{c.history}</h4>
   {detail.history.length?<ol className="space-y-2">{detail.history.map(entry=><li key={entry.actionId} className="rounded-xl border border-[#e5e7eb] p-3 text-sm">
    <p className="text-[#68778d]">{date(entry.at,en)}</p>
    <p className="mt-1">{historySummary(entry.before,entry.after,c)}</p>
   </li>)}</ol>:<p className="text-sm text-[#52627a]">{c.historyEmpty}</p>}
  </section>
 </section>;
}

function historySummary(before:ClientDashboardSettings|null,after:ClientDashboardSettings,c:ReturnType<typeof copy>){
 const parts:string[]=[];
 for(const key of sectionKeys)if((before?before[key]:sectionDefault[key])!==after[key])parts.push(`${c[key]}: ${after[key]?c.on:c.off}`);
 if((before?.welcomeText??null)!==after.welcomeText)parts.push(after.welcomeText?c.welcomeChanged:c.welcomeRemoved);
 return parts.length?parts.join(' · '):c.created;
}

function ClientWelcome({text,en}:{text:string;en:boolean}){
 // Visible heading (not only aria-label) so the customer knows who wrote the message.
 const id=useId();
 return <section data-client-dashboard-welcome-view aria-labelledby={id} className="space-y-1 rounded-2xl bg-[#eef6fb] p-4 text-sm"><h3 id={id} className="text-xs font-semibold uppercase tracking-wide text-[#3d5068]">{en?'Message from your professional':'Mensaje de su profesional'}</h3><p className="whitespace-pre-wrap break-words">{text}</p></section>;
}

/**
 * Customer side: loads the owner's preferences for this request and renders only
 * the chosen sections. While loading or after an error the configurable sections
 * stay hidden (with retry), so a hidden section never flashes into view.
 */
export function AppointmentClientDashboard({requestId,children}:{requestId:string;children:(view:AppointmentDashboard)=>ReactNode}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <ClientDashboardSession key={user.id+':'+requestId} accountId={user.id} requestId={requestId}>{children}</ClientDashboardSession>;
}

function ClientDashboardSession({accountId,requestId,children}:{accountId:string;requestId:string;children:(view:AppointmentDashboard)=>ReactNode}){
 const en=useLocale()==='en';
 const [view,setView]=useState<AppointmentDashboard|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),active=useRef(true),sequence=useRef(0);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 const load=useCallback(async()=>{const id=++sequence.current;setLoading(true);setError(false);try{const response=await fetch(api+'?'+new URLSearchParams({requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const body=appointmentDashboardSchema.parse(await response.json());if(active.current&&id===sequence.current)setView(body);}catch{if(active.current&&id===sequence.current)setError(true);}finally{if(active.current&&id===sequence.current)setLoading(false);}},[accountId,requestId]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 if(!view){
  if(error)return <div role="alert" data-client-dashboard-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{en?'Could not load the job information.':'No se pudo cargar la información del trabajo.'}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{en?'Retry':'Reintentar'}</Button></div>;
  return <p role="status" className="text-sm text-[#52627a]">{en?'Loading job information…':'Cargando información del trabajo…'}</p>;
 }
 return <>{view.welcomeText&&<ClientWelcome text={view.welcomeText} en={en}/>}{children(view)}</>;
}
