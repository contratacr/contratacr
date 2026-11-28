"use client";
import {CatalogItemExtras} from './catalog-item-extras';
import {CatalogItemSpecs} from './catalog-item-specs';
import {CatalogItemPricing} from './catalog-item-pricing';
import {CatalogItemKind} from './catalog-item-kind';
import {CatalogListChips} from './catalog-list-chips';
import {CatalogColumnsPicker,useCatalogColumns} from './catalog-list-columns';
import {WorkMessages} from './work-messages';
import {inventoryWriteInputSchema} from "@/lib/pro/inventory-write-recovery";
import {proPhone} from '@/lib/pro/phone';
import {clientWriteInputSchema} from "@/lib/pro/client-write-recovery";
import {ProRecordCard} from "./record-card";
import {ProSectionActions} from "./section-actions";
import {navigatePro,pushProParams,replaceProParams,PRO_BEFORE_PATH_CHANGE,closeProStep,currentProPath,currentCanonicalProPath,proDashboardPath,proJobRoute,backPro,openProSection,pushProPath} from "@/lib/pro/navigation";
import {AppointmentReschedule} from "./appointment-reschedule";
import {WorkAcceptedEstimate} from "./work-accepted-estimate";
import {JobWorkspace} from "./job-workspace";
import {JobPageFrame} from "./job-page-frame";
import {ProjectEstimates} from "./project-estimates";
import {WorkTasks} from "./work-tasks";
import {ProFormFooterProvider,ProFormFooterSlot} from "./form-footer";
import {WorkUpdates} from "./work-updates";
import {WorkFiles} from "./work-files";
import {ClientDashboardEditor} from "./client-dashboard";
import {ClientWorkAccess,WorkClientInvite} from "./work-client-invite";
import {WorkHeader,WorkPhaseText} from "./work-header";
import {WorkSidebar} from "./work-sidebar";
import {WorkFileOrganizer} from "./work-file-organizer";
import {WorkSubcontractors} from "./work-subcontractors";
import {WorkOverview,WorkQuoteNextStep} from "./work-overview";
import {ClientWorkSections} from "./client-work-sections";
import {WorkAllowances} from "./work-allowances";
import {WorkSelections} from "./work-selections";
import {SelectionTrackingPanel} from "./round10-selections";
import {SelectionVisibilityPanel} from "./round11-selections";
import {ProjectNotes} from "./project-notes";
import {WorkMeetings} from "./work-meetings";
import {WorkProjectEmail} from "./work-project-email";
import {ProjectDetails} from "./project-details";
import {WorkBids} from "./work-bids";
import {WorkContracts} from "./work-contracts";
import {WorkMoodBoards} from "./work-mood-boards";
import {WorkTakeoffs} from "./work-takeoffs";
import {WorkFloorPlans} from "./work-floor-plans";
import {ProjectSchedule} from "./project-schedule";
import {ScheduleLinksPanel} from "./round10-jobsite";
import {TimeTracking} from "./time-tracking";
import {WorkPurchaseOrders} from "./work-purchase-orders";
import {WorkInvoices} from "./work-invoices";
import {WorkBudgetForecast} from "./work-budget-forecast";
import {WorkCredits} from "./work-credits";
import {WorkDelivery} from "./work-delivery";
import {WorkChanges} from "./work-changes";
import {recordCreatedCustomer} from "@/lib/pro/created-customer";
import {useProChildGuard} from "./use-pro-child-guard";
import { ProSearchField } from "./search-field";
import {CatalogOrganizations,OrganizationSelect} from "./catalog-organizations";
import { ClientOperations } from "./client-operations";
import {ClientAccountStatement} from "./client-account-statement";
import {ClientPending} from "./client-pending";
import {useAppDialog} from "@/hooks/use-app-dialog";
import { InvoiceDraftAction } from "./invoice-draft";
import {ClientIdentification} from "./client-identification";
import {ClientFiscalSettings} from "./client-fiscal-settings";
import { ClientHistory } from "./client-history";
import {agendaDay,agendaWallTime} from "@/lib/pro/agenda-time";
import { crTodayISO } from "@/lib/time-cr";
import { CatalogSelect } from "./catalog-select";
import { AppointmentQuoteSelect } from "./appointment-quote-select";
import type { AgendaControls } from "./agenda-workspace";
import type { CatalogControls } from "./catalog-workspace";
import { CatalogImport } from "./catalog-import";
import { ContactsOrganizerDialog } from "./round10-sales";
import { ClientContactExtras } from "./client-contact-extras";
import { AgendaCalendar } from "./agenda-calendar";
import { proMoney } from "@/lib/pro/money";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale,useTranslations } from "next-intl";
import {usePathname} from "next/navigation";
import {useProSearchParams} from "./use-pro-search-params";
import {
  CalendarDays,
  Package,
  Plus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProModal as Modal } from "@/components/pro/modal";
import { PhoneInput, isPhoneComplete } from "@/components/ui/phone-input";
import {
  PanelEmptyState,
  PanelListSkeleton,
} from "@/components/ui/content-loading";
import { SectionHeadline } from "@/components/dashboard/section-headline";
import { StatusFilterTabs } from "@/components/dashboard/status-filter-tabs";
import {
  CardActionsMenu,
  type CardAction,
} from "@/components/dashboard/card-actions-menu";
import {
  businessSchema,
  saveClient,
  saveProduct,
  saveAppointment,
  moveStock,
  costaRicaDate,
  type Business,
} from "@/lib/pro/business";
import type { Quote } from "@/lib/quotes";
import { exportWork } from "@/lib/pro/workspace";
import { SocialPanel } from "./social-panel";
import { businessCsv, downloadFile } from "./exports";
const field =
  "mt-1 block min-h-11 w-full min-w-0 max-w-full box-border rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[15px] text-[#162543] focus:outline-none focus:ring-2 focus:ring-[#009FD9]";
type Section = "Agenda" | "Clientes" | "Inventario" | "Redes";
/** Round 2: a short readable code for new items instead of 12 hex characters. With the whole
 * catalog loaded it is the next number of that prefix (P-0001, S-0001…); a paged catalog only
 * knows some items, so it uses 6 unambiguous characters (P-K7Q2MX) to stay unique (SKUs are
 * unique per account in the database). */
function readableSku(prefix:"P"|"S",products:{sku:string}[],partial:boolean){if(partial){const alphabet="23456789ABCDEFGHJKMNPQRSTVWXYZ";return prefix+"-"+Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>alphabet[n%alphabet.length]).join("");}const pattern=new RegExp(`^${prefix}-(\\d{1,6})$`);const next=products.reduce((max,p)=>{const m=pattern.exec(p.sku);return m?Math.max(max,Number(m[1])):max;},0)+1;return `${prefix}-${String(next).padStart(4,"0")}`;}
export function BusinessPanel({
  accountId,
  section,
  data,
  ready,
  error,
  saving,
  commit,
  reload,
  catalog,
  agenda,
  dialogsOnly=false,
}: {
  dialogsOnly?: boolean;
  catalog?: CatalogControls;
  agenda?: AgendaControls;
  accountId: string;
  section: Section;
  data: Business;
  ready: boolean;
  error: string;
  saving: boolean;
  commit: (data: Business) => Promise<boolean>;
  reload: () => void;
}) {
  const journey=useTranslations('ProJourney'),{confirm:confirmJourney,dialogNode:journeyDialog}=useAppDialog();
  const [finishError,setFinishError]=useState(''),[finishing,setFinishing]=useState(false);
  const locale = useLocale(),
    en = locale === "en";
  const tr = (es: string, english: string) => (en ? english : es);
  const agendaText=useTranslations("ProAgendaUX"),ux=useTranslations("ProUsability"),simple=useTranslations("ProSimple");
  // Project estimates live only in the independent Pro space (same rule as ProjectEstimates).
  // Round 9: the job's own route (/dashboard/pro/trabajo/<id>/<section>) is part of the Pro space.
  const pathname=usePathname()??"",jobRoute=!!proJobRoute(pathname),proSpace=/\/dashboard\/pro$/.test(pathname)||jobRoute;
  const DetailFrame=jobRoute?JobPageFrame:Modal;
  const params = useProSearchParams();
  const [clientDone,setClientDone]=useState(false);
  // ClientOperations waits for the account itself (B6). Keep the same instance
  // when the account first resolves; remount only if it changes to another one.
  // A remount on ""→id repeated every read and discarded nested state (a
  // visible load error in job costs or a pending cost-write recovery).
  const [operationsOwner,setOperationsOwner]=useState({id:accountId,generation:0});
  if(accountId&&accountId!==operationsOwner.id)setOperationsOwner({id:accountId,generation:operationsOwner.id?operationsOwner.generation+1:operationsOwner.generation});
  const clientRecovery=section==='Clientes'?catalog?.clientRecovery:undefined;
  const clientBlocked=!!clientRecovery?.blocked;
  const inventoryRecovery=section==='Inventario'?catalog?.inventoryRecovery:undefined;
  const inventoryBlocked=!!inventoryRecovery?.blocked;
  const writeBlocked=clientBlocked||inventoryBlocked;
  const inventoryBody=inventoryRecovery?.attempt?.body;
  const inventoryInput=useMemo(()=>inventoryBody?inventoryWriteInputSchema.parse(JSON.parse(inventoryBody)):null,[inventoryBody]);
  const inventoryRef=useRef(inventoryRecovery);inventoryRef.current=inventoryRecovery;
  const [inventoryDone,setInventoryDone]=useState<'form'|'movement'|null>(null);
  const recoveryBody=clientRecovery?.attempt?.body;
  const recoveryInput=useMemo(()=>recoveryBody?clientWriteInputSchema.parse(JSON.parse(recoveryBody)):null,[recoveryBody]);
  const recoveryRef=useRef(clientRecovery);recoveryRef.current=clientRecovery;
  const blockedRef=useRef(writeBlocked);blockedRef.current=writeBlocked;
  const [localSearch, setLocalSearch] = useState(""), [localFilter, setLocalFilter] = useState("all");
  const search=catalog?.search??localSearch, filter=catalog?.filter??localFilter;
  const setSearch=catalog?.setSearch??setLocalSearch, setFilter=catalog?.setFilter??setLocalFilter;
  const [editing, setEditing] = useState<string | null>(null),
    [detail, setDetail] = useState<string | null>(null),
    [stock, setStock] = useState<string | null>(null);
  const submitLock = useRef(false),detailRequest=useRef(0),discardPrompt=useRef(false);
  const pendingClose=useRef<'edit'|'stock'|null>(null),[closeCheck,setCloseCheck]=useState(0);
  const formDirty=useRef(false),stockDirty=useRef(false);
  const [acceptedEstimateState,setAcceptedEstimateState]=useState({dirty:false,busy:false}),[filesState,setFilesState]=useState({dirty:false,busy:false}),[updatesState,setUpdatesState]=useState({dirty:false,busy:false}),[taskState,setTaskState]=useState({dirty:false,busy:false}),[deliveryState,setDeliveryState]=useState({dirty:false,busy:false}),[changeState,setChangeState]=useState({dirty:false,busy:false}),[nestedWarning,setNestedWarning]=useState(false),[rescheduleState,setRescheduleState]=useState({dirty:false,busy:false}),[clientViewState,setClientViewState]=useState({dirty:false,busy:false});
  const [operationsBlocked,setOperationsBlocked]=useState(false),[allowancesState,setAllowancesState]=useState({dirty:false,busy:false}),[selectionsState,setSelectionsState]=useState({dirty:false,busy:false}),[moodBoardsState,setMoodBoardsState]=useState({dirty:false,busy:false}),[takeoffsState,setTakeoffsState]=useState({dirty:false,busy:false}),[ordersState,setOrdersState]=useState({dirty:false,busy:false}),[creditsState,setCreditsState]=useState({dirty:false,busy:false}),[scheduleState,setScheduleState]=useState({dirty:false,busy:false}),[timeState,setTimeState]=useState({dirty:false,busy:false}),[notesState,setNotesState]=useState({dirty:false,busy:false}),[detailsState,setDetailsState]=useState({dirty:false,busy:false}),[bidsState,setBidsState]=useState({dirty:false,busy:false}),[contractsState,setContractsState]=useState({dirty:false,busy:false});
  const baseNestedBlocked=operationsBlocked||filesState.dirty||filesState.busy||updatesState.dirty||updatesState.busy||taskState.dirty||taskState.busy||deliveryState.dirty||deliveryState.busy||changeState.dirty||changeState.busy||rescheduleState.dirty||rescheduleState.busy||clientViewState.dirty||clientViewState.busy||allowancesState.dirty||allowancesState.busy||selectionsState.dirty||selectionsState.busy||moodBoardsState.dirty||moodBoardsState.busy||takeoffsState.dirty||takeoffsState.busy||ordersState.dirty||ordersState.busy||creditsState.dirty||creditsState.busy||scheduleState.dirty||scheduleState.busy||timeState.dirty||timeState.busy||notesState.dirty||notesState.busy||detailsState.dirty||detailsState.busy||bidsState.dirty||bidsState.busy||contractsState.dirty||contractsState.busy;
  const nestedBlocked=baseNestedBlocked||acceptedEstimateState.busy;
  const warnNested=useCallback(()=>setNestedWarning(true),[]);
  useProChildGuard(nestedBlocked||finishing||writeBlocked,writeBlocked?()=>setFormError(tr("Compruebe el guardado antes de salir.","Check the saved result before leaving.")):warnNested);
  const [editReady,setEditReady]=useState(false),[editFailed,setEditFailed]=useState(false),[editRetry,setEditRetry]=useState(0);
  const [detailBusy,setDetailBusy]=useState(false),[detailFailed,setDetailFailed]=useState(false);
  const [service, setService] = useState("");
  const [catalogItemType,setCatalogItemType]=useState<"product"|"service">("product");
  const [legacyQuote, setLegacyQuote] = useState(params.get("anterior") || "");
  const [exportError, setExportError] = useState("");
  const [phone, setPhone] = useState(""),
    [clientId, setClientId] = useState(params.get("cliente") || ""),
    [selectedQuote, setSelectedQuote] = useState(
      params.get("cotizacion") || "",
    );
  const [formError, setFormError] = useState(""),
    [quotes, setQuotes] = useState<Quote[]>([]),
    [quoteError, setQuoteError] = useState("");
  const [visible, setVisible] = useState(20);
  const [sortKey,setSortKey]=useState<'default'|'name'|'cost'|'price'|'stock'>('default'),[sortDir,setSortDir]=useState<'asc'|'desc'>('asc');
  const [catalogColumns,setCatalogColumns]=useCatalogColumns();
  const sentinel = useRef<HTMLDivElement>(null);
  const [localDay,setLocalDay]=useState(crTodayISO);
  const calendarDay=agenda?.day??localDay,setCalendarDay=agenda?.setDay??setLocalDay;
  const latestReload=useRef(reload);
  useEffect(()=>{latestReload.current=reload;},[reload]);
  useEffect(()=>{
    if(section!=="Agenda")return;
    const refresh=()=>{if(document.visibilityState==="visible"&&!saving&&!editing)latestReload.current();};
    const timer=window.setInterval(refresh,30000);
    window.addEventListener("focus",refresh);
    return()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);};
  },[section,saving,editing]);
  const dataRef=useRef(data);useEffect(()=>{dataRef.current=data;},[data]);
  const detailLoader=useRef(catalog?.detail??agenda?.detail);detailLoader.current=catalog?.detail??agenda?.detail;
  const detailParam=section==="Clientes"?"cliente":section==="Inventario"?"producto":"cita";
  async function openDetail(id:string,push=true){
    if(push&&new URL(currentCanonicalProPath(),window.location.origin).searchParams.get(detailParam)!==id){pushProParams({[detailParam]:id,editar:null,movimiento:null});return;}
    // Round 1 (2026-11-12): re-opening the record that is already on screen (a URL change inside the
    // job, e.g. from a nested view) refreshes it quietly; a transient failure keeps the open job
    // instead of replacing it with «No se pudo cargar el registro».
    const already=detail===id&&!detailFailed;
    const request=++detailRequest.current;setDetail(id);setDetailFailed(false);if(!already)setDetailBusy(!!detailLoader.current);
    if(detailLoader.current){const ok=await detailLoader.current(id);if(request===detailRequest.current){if(!(already&&!ok))setDetailFailed(!ok);setDetailBusy(false);}}
  }
  function closeDetail(){if(nestedBlocked||finishing){warnNested();return;}detailRequest.current++;setDetail(null);setDetailBusy(false);setDetailFailed(false);if(section==='Agenda'){
    const manualOrigin=proDashboardPath(params.get('volverSolicitudManual')),manualUrl=manualOrigin?new URL(manualOrigin,window.location.origin):null;
    if(manualOrigin&&manualUrl?.searchParams.get('tab')==='pro_leads'&&manualUrl.searchParams.get('solicitudManual')===params.get('solicitudManualOrigen')&&params.get('solicitudManualOrigen')&&backPro(manualOrigin))return;
    const projectsOrigin=proDashboardPath(params.get('volverProyectos'));
    if(projectsOrigin&&new URL(projectsOrigin,window.location.origin).searchParams.get('tab')==='pro_projects'&&backPro(projectsOrigin))return;
    const dayOrigin=proDashboardPath(params.get('volverDia'));
    if(dayOrigin&&new URL(dayOrigin,window.location.origin).searchParams.get('tab')==='home'&&backPro(dayOrigin))return;
    const target=proDashboardPath(params.get('volverCitaSolicitud')),origin=target?new URL(target,window.location.origin):null;
    if(target&&['pro_agenda','appointments'].includes(origin!.searchParams.get('tab')||'')&&origin!.searchParams.get('citaSolicitud')&&backPro(target))return;
  }if(params.get(detailParam))closeProStep(detailParam,'volverCitaSolicitud','volverDia','solicitudManualOrigen','volverSolicitudManual','volverProyectos');}
  // Round 8: the job page's back arrow leaves the job (to its origin, or to the jobs list as a new
  // history step, so the browser Back returns to the job). Section changes inside stay history steps.
  function leaveJobPage(){
    if(nestedBlocked||finishing){warnNested();return;}
    if(['volverCitaSolicitud','volverDia','volverSolicitudManual','volverProyectos'].some(name=>params.get(name))){closeDetail();return;}
    // Round 9: the job is its own document. Opened from another Pro screen (task center, hours, avisos…),
    // «Volver» returns there: browser Back when still on the job's first entry, else that screen anew.
    if(jobRoute){
      let origin:string|null=null;try{const ref=document.referrer?new URL(document.referrer):null;origin=ref&&ref.origin===window.location.origin?proDashboardPath(ref.pathname+ref.search):null;}catch{origin=null;}
      if(origin&&!proJobRoute(new URL(origin,window.location.origin).pathname)&&new URL(origin,window.location.origin).searchParams.get('tab')!=='pro_agenda'){
        if(!window.history.state?.ccrProNavigation&&window.history.length>1){window.history.back();return;}
        pushProPath(origin);return;
      }
    }
    const canonical=new URL(currentCanonicalProPath(),window.location.origin),current=canonical.searchParams,next=new URLSearchParams();
    for(const name of ['tab','vista','dia','mes','q'])if(current.get(name))next.set(name,current.get(name)!);
    // Round 9: from the job's own route this leaves the job document for the jobs list.
    pushProPath(canonical.pathname+'?'+next);
  }
  const openDetailRef=useRef(openDetail);openDetailRef.current=openDetail;
  useEffect(()=>{
    const id=params.get(detailParam);
    if(params.get("editar")||params.get("nueva")==="1"||params.get("movimiento")){setDetail(null);return;}
    if(id)void openDetailRef.current(id,false);
    else{detailRequest.current++;setDetail(null);setDetailBusy(false);setDetailFailed(false);}
  },[params,detailParam]);
  const key = `ccr:pro:form:${accountId}:${section}`;
  const autoClientFields=useRef<Record<string,string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!accountId||writeBlocked) return;
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || "{}");
      const query=new URL(currentCanonicalProPath(),window.location.origin).searchParams,requestedEdit=query.get("editar")||(query.get("nueva")==="1"?"new":null);
      if(value._editing&&!requestedEdit)pushProParams({editar:value._editing});
    } catch {
      /* Keep account data untouched if a browser draft is invalid. */
    }
  }, [key, accountId,writeBlocked]);
  useEffect(() => {
    if (catalog || agenda || section !== "Clientes" && section !== "Agenda") return;
    let alive = true;
    fetch("/api/quotes")
      .then(async (r) => {
        if (!r.ok) throw Error();
        const b = await r.json();
        if (alive) setQuotes(b.quotes || []);
      })
      .catch(() => {
        if (alive)
          setQuoteError(
            tr(
              "No se pudieron cargar las cotizaciones.",
              "Could not load quotes.",
            ),
          );
      });
    return () => {
      alive = false;
    };
  }, [section, en]); // eslint-disable-line react-hooks/exhaustive-deps
  const editPath=params.get("editar")||(section==="Agenda"&&params.get("nueva")==="1"?"new":null);
  useEffect(()=>{
    let alive=true;
    async function prepare(){
      if(inventoryInput){const recovered=inventoryInput.rows[0];if(inventoryInput.inventoryWriteMode==='movement'){setEditing(null);setStock(recovered.id);return;}setEditing(inventoryInput.inventoryWriteMode==='create'?'new':recovered.id);setDraft(Object.fromEntries(Object.entries(recovered).map(([name,value])=>[name,String(value??'')])));setCatalogItemType(recovered.itemType==='service'?'service':'product');setEditReady(true);setEditFailed(false);return;}
      if(recoveryInput){const recovered=recoveryInput.rows[0];setEditing(recoveryInput.clientWriteMode==='create'?'new':recovered.id);setDraft(Object.fromEntries(Object.entries(recovered).map(([name,value])=>[name,String(value??'')])));setPhone(recovered.phone);setEditReady(true);setEditFailed(false);return;}
      if(!ready)return;
      if(!editPath){setEditing(null);setEditReady(false);return;}
      setEditing(editPath);setEditReady(false);setEditFailed(false);
      try{formDirty.current=JSON.parse(sessionStorage.getItem(key)||"{}")._editing===editPath;}catch{formDirty.current=false;}
      try{
        const rows=section==="Clientes"?dataRef.current.clients:section==="Inventario"?dataRef.current.products:dataRef.current.work;
        const record=editPath!=="new"?(detailLoader.current?await detailLoader.current(editPath):rows.find(row=>row.id===editPath)):undefined;
        if(!alive)return;
        if(editPath!=="new"&&!record)throw Error();
        let saved:Record<string,string>={};
        try{const raw=JSON.parse(sessionStorage.getItem(key)||"{}");if(raw&&raw._editing===editPath)saved=raw;}catch{/* Invalid local drafts cannot block an authorized record. */}
        autoClientFields.current={};
        try{const fields=JSON.parse(saved._autoClientFields||'{}');for(const name of ['name','email','phone'])if(typeof fields[name]==='string')autoClientFields.current[name]=fields[name];}catch{/* Invalid draft metadata cannot alter fields. */}
        formDirty.current=Object.keys(saved).length>0;
        setDraft(saved);
        setCatalogItemType(editPath==="new"?(saved.itemType==="service"?"service":"product"):(record&&"itemType" in record&&record.itemType==="service"?"service":"product"));
        setPhone(saved.phone??(record&&"phone" in record?record.phone:""));
        setService(saved.service??(record&&"service" in record?record.service:""));
        setClientId(saved.clientId??(record&&"clientId" in record?record.clientId:params.get("cliente")||""));
        setSelectedQuote(saved.externalQuoteId??(record&&"externalQuoteId" in record?record.externalQuoteId:params.get("cotizacion")||""));
        setLegacyQuote(saved.quoteId??(record&&"quoteId" in record?record.quoteId:params.get("anterior")||""));
        setEditReady(true);
      }catch{if(alive)setEditFailed(true);}
    }
    void prepare();return()=>{alive=false;};
  },[editPath,ready,key,params,editRetry,section,recoveryInput,inventoryInput]);
  useEffect(()=>{if(inventoryInput?.inventoryWriteMode==='movement'){setStock(inventoryInput.rows[0].id);return;}const id=params.get("movimiento");stockDirty.current=false;setStock(id);if(id)void detailLoader.current?.(id);},[params,inventoryInput]);
  useEffect(() => {
    if(error||catalog?.loading||agenda?.loading)return;
    const node = sentinel.current;
    if (!node) return;
    let queued = false;
    const reveal = () => {
      if (queued) return;
      queued = true;
      if(agenda)agenda.more();else if(catalog)catalog.more();else setVisible((v) => v + 20);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reveal();
      },
      { rootMargin: "160px" },
    );
    // Safari can miss an observer update after restoring a suspended page.
    const check = () => {
      const rect = node.getBoundingClientRect();
      if (
        rect.top <
          (window.visualViewport?.height || window.innerHeight) + 160 &&
        rect.bottom >= 0
      )
        reveal();
    };
    observer.observe(node);
    document.addEventListener("scroll", check, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", check);
    return () => {
      observer.disconnect();
      document.removeEventListener("scroll", check, true);
      window.removeEventListener("resize", check);
    };
  }, [visible, ready, section, search, filter, calendarDay, data, catalog, agenda, error]);
  useEffect(() => {
    if (!editing || !accountId||writeBlocked) return;
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) || "{}");
      if (stored._editing)
        sessionStorage.setItem(key, JSON.stringify({ ...stored, phone }));
    } catch {}
  }, [phone, editing, key, accountId,writeBlocked]);
  useEffect(() => {
    if (editing === "new")
      setService(
        (current) =>
          current ||
          quotes.find((q) => q.id === selectedQuote)?.title ||
          data.quotes.find((q) => q.id === params.get("anterior"))?.title ||
          "",
      );
  }, [editing, selectedQuote, quotes, data.quotes, params]);
  const navigate = navigatePro;
  // «Abrir cliente existente»: the identification itself is the only typed
  // input (lookup autofill excluded), so there is nothing manual to discard.
  function onlyIdentificationTyped(){
    if(editing!=="new")return false;
    const form=document.getElementById('pro-business-form');if(!(form instanceof HTMLFormElement))return false;
    for(const field of Array.from(form.elements)){
      if(!(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement)||!field.name||field.name==='identification')continue;
      if(field instanceof HTMLInputElement&&['hidden','checkbox','radio','submit','button','reset'].includes(field.type))continue;
      if(field.value.trim()&&field.value!==autoClientFields.current[field.name])return false;
    }
    return !phone||phone===autoClientFields.current.phone;
  }
  function openEdit(id: string,fromIdentification=false) {
    if(blockedRef.current)return;
    if(formDirty.current&&editing){if(editing===id)return;if(!(fromIdentification&&onlyIdentificationTyped())){void requestFormClose(()=>{formDirty.current=false;openEdit(id);},true);return;}}
    formDirty.current=false;
    setEditReady(false);pushProParams({editar:id,nueva:null,movimiento:null});
    setFormError("");
    setDraft({});
    sessionStorage.removeItem(key);
    setEditing(id);
    setPhone(data.clients.find((c) => c.id === id)?.phone || "");
    const w = data.work.find((w) => w.id === id);
    setService(w?.service || "");
    setLegacyQuote(w?.quoteId || params.get("anterior") || "");
    setClientId(w?.clientId || params.get("cliente") || "");
    setSelectedQuote(w?.externalQuoteId || params.get("cotizacion") || "");
  }
  function closeEdit(preserveDraft=false) {
    if(params.get("editar")||params.get("nueva")==="1")closeProStep("editar","nueva");
    clearEdit(preserveDraft);
  }
  function clearEdit(preserveDraft=false){
    pendingClose.current=null;
    formDirty.current=false;
    autoClientFields.current={};
    setEditing(null);
    setDraft({});
    if(!preserveDraft)sessionStorage.removeItem(key);
    setFormError("");
  }
  const closeCompletedInventory=useRef(()=>{});closeCompletedInventory.current=()=>{if(inventoryDone==='movement')closeStock();else closeEdit(true);};
  useEffect(()=>{if(inventoryDone&&!inventoryBlocked){closeCompletedInventory.current();setInventoryDone(null);}},[inventoryDone,inventoryBlocked]);
  const closeCompletedClient=useRef(()=>{});closeCompletedClient.current=()=>closeEdit(true);
  useEffect(()=>{if(clientDone&&!clientBlocked){closeCompletedClient.current();setClientDone(false);}},[clientDone,clientBlocked]);
  useEffect(()=>{
    if(!editing&&!stock)return;
    const before=(event:Event)=>{
      if(!formDirty.current&&!stockDirty.current)return;
      const path=(event as CustomEvent<{path:string}>).detail?.path;if(!path)return;
      const target=new URL(path,window.location.origin),current=new URL(currentCanonicalProPath(),window.location.origin);
      if(target.pathname!==current.pathname||target.searchParams.get('tab')!==current.searchParams.get('tab')){
        event.preventDefault();setFormError(en?"Save or cancel the form before leaving.":"Guarde o cancele el formulario antes de salir.");
      }
    };
    window.addEventListener(PRO_BEFORE_PATH_CHANGE,before);
    return()=>window.removeEventListener(PRO_BEFORE_PATH_CHANGE,before);
  },[editing,stock,en]);
  function closeStock(){pendingClose.current=null;stockDirty.current=false;setStock(null);setFormError("");if(params.get("movimiento"))closeProStep("movimiento");}
  // A close asked for while a save or the list refresh is running used to be dropped without a word: «Cerrar» did
  // nothing and the editor (and its address) stayed open (CI run 45742172948, pro-navigation: the catalog list
  // reload after back/forward shows as saving). It is now remembered and carried out once that work ends, with the
  // same unsaved-changes question; a save that closes the editor itself makes it moot.
  const flushPendingClose=useRef(()=>{});
  async function requestFormClose(close:()=>void,dirty:boolean){
    if(discardPrompt.current||blockedRef.current)return;
    if(saving||submitLock.current){pendingClose.current=close===closeStock?'stock':'edit';return;}
    pendingClose.current=null;
    if(dirty){
      discardPrompt.current=true;
      try{
        const answer=await confirmJourney({title:tr("¿Descartar cambios?","Discard changes?"),description:tr("Los cambios sin guardar se perderán. Los datos guardados se conservan.","Unsaved changes will be lost. Saved records are preserved."),confirmLabel:tr("Descartar cambios","Discard changes"),cancelLabel:tr("Seguir editando","Keep editing")});
        if(!answer.confirmed)return;
      }finally{discardPrompt.current=false;}
    }
    close();
  }
  flushPendingClose.current=()=>{
    const kind=pendingClose.current;if(!kind||saving||submitLock.current)return;
    pendingClose.current=null;
    if(blockedRef.current||(kind==='stock'?!stock:!editing))return;
    void requestFormClose(kind==='stock'?closeStock:closeEdit,kind==='stock'?stockDirty.current:formDirty.current);
  };
  // Runs after the save's own effects (clientDone/inventoryDone close the editor and clear the request first).
  useEffect(()=>{if(!saving)flushPendingClose.current();},[saving,editing,stock,closeCheck]);
  function changeOrganization(name:"group"|"category",value:string){
    setDraft(old=>({...old,[name]:value}));
    queueMicrotask(()=>{const form=document.getElementById('pro-business-form');if(form instanceof HTMLFormElement)persist(form);});
  }
  function persist(form: HTMLFormElement, nextPhone=phone) {
    // Without the account id the draft key would not be scoped to the account.
    if(blockedRef.current||!accountId)return;
    formDirty.current=true;
    // Wait for controlled selects/hidden quote IDs to commit before taking the draft.
    queueMicrotask(()=>{
      if(!form.isConnected||blockedRef.current)return;
      const values=Object.fromEntries([...new FormData(form).entries()].map(([k,v])=>[k,String(v)]));
      sessionStorage.setItem(key,JSON.stringify({...values,clientId:values.clientId??clientId,_editing:editing,phone:nextPhone,_autoClientFields:JSON.stringify(autoClientFields.current)}));
    });
  }
  function prefillClient(contact:{name:string;email?:string;phone?:string}){
    if(blockedRef.current)return;
    const form=document.getElementById('pro-business-form');if(!(form instanceof HTMLFormElement))return;
    for(const name of ['name','email'] as const){const field=form.elements.namedItem(name);if(field instanceof HTMLInputElement&&!field.value.trim()&&contact[name]){field.value=contact[name]!;autoClientFields.current[name]=contact[name]!;}}
    const nextPhone=phone||contact.phone||'';if(nextPhone!==phone){setPhone(nextPhone);autoClientFields.current.phone=nextPhone;}
    persist(form,nextPhone);
  }
  function clearClientAutofill(){
    if(blockedRef.current)return;
    const form=document.getElementById('pro-business-form');if(!(form instanceof HTMLFormElement))return;
    for(const name of ['name','email']){const field=form.elements.namedItem(name);if(field instanceof HTMLInputElement&&autoClientFields.current[name]&&field.value===autoClientFields.current[name])field.value='';}
    const nextPhone=autoClientFields.current.phone===phone?'':phone;if(nextPhone!==phone)setPhone(nextPhone);
    autoClientFields.current={};persist(form,nextPhone);
  }
  async function apply(run: () => Business) {
    if (submitLock.current) return;
    submitLock.current = true;
    try {
      setFormError("");
      const next=run();
      const customerWrite=section==='Clientes'&&editing&&clientRecovery;
      const customer=customerWrite?(editing==='new'?next.clients.find(item=>!data.clients.some(old=>old.id===item.id)):next.clients.find(item=>item.id===editing)):undefined;
      const inventoryWrite=section==='Inventario'&&(editing||stock)&&inventoryRecovery;
      const product=inventoryWrite?(stock?next.products.find(item=>item.id===stock):editing==='new'?next.products.find(item=>!data.products.some(old=>old.id===item.id)):next.products.find(item=>item.id===editing)):undefined;
      const newMovements=next.movements.filter(item=>!data.movements.some(old=>old.id===item.id));
      if (await (customerWrite&&customer?customerWrite.save(customer,editing==='new'?'create':'edit'):inventoryWrite&&product?inventoryWrite.save(product,stock?'movement':editing==='new'?'create':'edit',newMovements):commit(next))) {
        if(inventoryWrite){setInventoryDone(stock?'movement':'form');return;}
        if(customerWrite){if(editing==='new'&&customer)recordCreatedCustomer(accountId,customer.id);setClientDone(true);return;}
        const changed=section==="Agenda"&&editing ? next.work.find(w=>w.id===editing)||next.work.find(w=>!data.work.some(old=>old.id===w.id)) : undefined;
        if(changed&&Number.isFinite(Date.parse(changed.start)))setCalendarDay(agendaDay(changed.start));
        if(changed&&editing==="new"&&(dialogsOnly||params.get("cotizacion")||params.get("anterior"))){
          clearEdit();
          replaceProParams({nueva:null,editar:null,cliente:null,cotizacion:null,anterior:null,cita:changed.id,...(dialogsOnly?{estadoCitas:"confirmed"}:{})});
        }else if(stock)closeStock();else closeEdit();
      }
    } catch (e) {
      setFormError(
        e instanceof Error
          ? e.message === "Revise producto, cantidad y motivo. No se permiten existencias negativas."
            ? tr("Revise producto, cantidad y motivo. No se permiten existencias negativas.", "Check the product, quantity and reason. Stock cannot be negative.")
            : e.message
          : tr("Revise los datos.", "Check the information."),
      );
    } finally {
      submitLock.current = false;
      if(pendingClose.current)setCloseCheck(value=>value+1);
    }
  }
  async function finishWork(work:Business['work'][number]){
    if(submitLock.current||nestedBlocked||saving||finishing||editing||work.cancelled||work.stage==='completed')return;
    let claimed=false;setFinishing(true);setFinishError('');
    try{const answer=await confirmJourney({title:journey('finishTitle'),description:journey('finishHint'),confirmLabel:journey('finishConfirm'),cancelLabel:journey('cancel')});if(!answer.confirmed)return;
      if(submitLock.current||nestedBlocked||saving)return;submitLock.current=true;claimed=true;
      let context=data;
      if(work.quoteId&&!data.quotes.some(row=>row.id===work.quoteId)){
        const response=await fetch('/api/pro/quotes?'+new URLSearchParams({id:work.quoteId,legacy:'1'}),{cache:'no-store'}),body=await response.json();if(!response.ok)throw Error();const quote=businessSchema.shape.quotes.parse(body.document?.quotes).find(row=>row.id===work.quoteId);if(!quote||quote.clientId!==work.clientId||quote.status!=='accepted')throw Error();context={...context,quotes:[...context.quotes,quote]};
      }
      if(work.externalQuoteId&&!data.quoteLinks.some(row=>row.quoteId===work.externalQuoteId&&row.clientId===work.clientId)){
        const response=await fetch('/api/pro/quotes?'+new URLSearchParams({id:work.externalQuoteId}),{cache:'no-store'}),body=await response.json();if(!response.ok||body.quote?.id!==work.externalQuoteId||body.quote?.status!=='accepted'||body.link?.clientId!==work.clientId)throw Error();context={...context,quoteLinks:[...context.quoteLinks,{quoteId:work.externalQuoteId,clientId:work.clientId}]};
      }
      const next=saveAppointment(context,{...work,stage:'completed'});if(!await commit(next))setFinishError(journey('finishError'));
    }catch{setFinishError(journey('finishError'));}finally{if(claimed)submitLock.current=false;setFinishing(false);}
  }
  const source =
    section === "Clientes"
      ? data.clients
      : section === "Inventario"
        ? data.products
        : data.work;
  const row = source.find((r) => r.id === editing) as unknown as
    | Record<string, unknown>
    | undefined;
  const allowEmptyWorkDates=section==='Agenda'&&(row?.stage==='new'||row?.stage==='quoting'||row?.stage==='completed'&&!row.start&&!row.end);
  const forms=useTranslations("ProForms");
  const value = (name: string) =>
    draft[name] ??
    String(
      row?.[name] ??
        (name === "service"
          ? quotes.find((q) => q.id === selectedQuote)?.title ||
            data.quotes.find((q) => q.id === params.get("anterior"))?.title ||
            ""
          : section === "Inventario" && editing === "new" && ["stock","minimum","cost"].includes(name) ? "0" : section === "Agenda" && (name === "start" || name === "end") ? `${calendarDay}T${name === "start" ? "09" : "10"}:00` : ""),
    );
  const input = (
    name: string,
    label: string,
    type = "text",
    required = true,
  ) => (
    <label className="block text-[13px] font-bold">
      {label}{required&&<span aria-hidden className="text-red-500"> *</span>}
      <input
        name={name}
        aria-label={label}
        type={type}
        required={required}
        maxLength={type==="text"?({address:500,tradeName:160,group:80,category:80,unit:30,cabys:13}[name]??160):undefined}
        inputMode={type==="number"?"decimal":undefined}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "0.001" : undefined}
        defaultValue={
          type === "datetime-local" ? (/Z$|[+-]\d{2}:\d{2}$/.test(value(name))?agendaWallTime(value(name)):value(name).slice(0,16)) : value(name)
        }
        className={field+(type==="datetime-local"?" appearance-none":"")}
      />
    </label>
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if(writeBlocked)return;
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) || ""),
      n = (k: string) => Number(f.get(k));
    const id = editing === "new" ? crypto.randomUUID() : editing!;
    if (section === "Clientes" && phone && !isPhoneComplete(phone)) {
      setFormError(tr("Revise el teléfono.", "Check the phone number."));
      return;
    }
    const originalWorkStage:Business["work"][number]["stage"]=row?.stage==='new'||row?.stage==='quoting'||row?.stage==='scheduled'||row?.stage==='completed'?row.stage:'scheduled';
    const nextStart=s("start")?(row?.start&&agendaWallTime(String(row.start))===s("start")?String(row.start):costaRicaDate(s("start"))):'',nextEnd=s("end")?(row?.end&&agendaWallTime(String(row.end))===s("end")?String(row.end):costaRicaDate(s("end"))):'';
    const nextWorkStage:Business["work"][number]["stage"]=(originalWorkStage==='new'||originalWorkStage==='quoting')&&nextStart&&nextEnd&&(nextStart!==String(row?.start??'')||nextEnd!==String(row?.end??''))?'scheduled':originalWorkStage;
    if(section==='Agenda'){
      const hasStart=!!s("start"),hasEnd=!!s("end"),startAt=Date.parse(nextStart),endAt=Date.parse(nextEnd);
      if(hasStart!==hasEnd||!hasStart&&!allowEmptyWorkDates||hasStart&&(!Number.isFinite(startAt)||!Number.isFinite(endAt)||endAt<=startAt||agendaWallTime(nextStart)!==s("start")||agendaWallTime(nextEnd)!==s("end"))){setFormError(tr("Revise la fecha y hora de inicio y final. Puede dejar ambas vacías si el trabajo aún no está programado.","Check the start and end date and time. Leave both blank only when the job is not scheduled yet."));return;}
    }
    await apply(() =>
      section === "Clientes"
        ? saveClient(data, {
            id,
            name: s("name"),
            email: s("email"),
            phone,
            notes: s("notes"),
            archived: Boolean(row?.archived),
            ...(s("identification")||row?.identification!==undefined?{identification:s("identification")} : {}),
            ...(s("tradeName")||row?.tradeName!==undefined?{tradeName:s("tradeName")} : {}),
            ...(s("group")||row?.group!==undefined?{group:s("group")} : {}),
            ...(s("address")||row?.address!==undefined?{address:s("address")} : {}),
          })
        : section === "Inventario"
          ? saveProduct(data, {
              id,
              sku: s("sku").trim() || (editing!=="new"&&typeof row?.sku==="string"?row.sku:"") || readableSku(catalogItemType==="service"?"S":"P",data.products,!!catalog),
              name: s("name"),
              stock: catalogItemType==="service"?0:row ? Number(row.stock) : n("stock"),
              minimum: catalogItemType==="service"?0:n("minimum"),
              ...(row?.itemType!==undefined||!row?{itemType:catalogItemType}:{}),
              cost: n("cost"),
              price: n("price"),
              archived: Boolean(row?.archived),
              category:s("category"),unit:s("unit"),cabys:s("cabys"),
            })
          : (agenda ? (state:Business,work:Business["work"][number])=>({...state,work:[...state.work.filter(w=>w.id!==work.id),work]}) : saveAppointment)(data, {
              id,
              bookingClientId: typeof row?.bookingClientId === "string" ? row.bookingClientId : undefined,
              clientId,
              client: data.clients.find((c) => c.id === clientId)?.name || clientId,
              service: s("service"),
              stage: nextWorkStage,
              cancelled: Boolean(row?.cancelled),
              start: nextStart,
              end: nextEnd,
              quoteId: s("quoteId") || undefined,
              externalQuoteId: selectedQuote || undefined,
            }),
    );
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = (d: string) => {
    if(!d.trim())return tr("Sin programar","Not scheduled");
    const at=Date.parse(d);if(!Number.isFinite(at))return tr("Fecha no disponible","Date unavailable");
    return new Intl.DateTimeFormat(en ? "en-US" : "es-CR", {
      timeZone: "America/Costa_Rica",dateStyle: "medium",timeStyle: "short",
    }).format(new Date(at));
  };
  const workStatus=(work:Pick<Business["work"][number],"stage"|"cancelled">)=>work.cancelled?tr("Cancelada","Cancelled"):work.stage==='new'?tr("Nuevo","New"):work.stage==='quoting'?tr("En cotización","Quoting"):work.stage==='completed'?tr("Finalizada","Completed"):tr("Agendada","Scheduled");
  const money = proMoney;
  const matches = (text: string) =>
    text
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .includes(
        search
          .toLocaleLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, ""),
      );
  const clients = data.clients.filter(
    (c) =>
      matches(`${c.name} ${c.email} ${c.phone} ${c.identification||""} ${c.tradeName||""} ${c.group||""}`) &&
      (filter === "archived"
        ? c.archived
        : filter === "all"
          ? !c.archived
          : true),
  );
  const products = data.products.filter(
    (p) =>
      matches(`${p.name} ${p.sku} ${p.category||""} ${p.cabys||""}`) &&
      (filter === "archived"
        ? p.archived
        : !p.archived && (filter!=="products"||p.itemType!=="service") && (filter!=="services"||p.itemType==="service") && (filter !== "low" || p.itemType!=="service"&&p.minimum>0&&p.stock <= p.minimum)),
  );
  const work = agenda ? agenda.ids.map(id=>data.work.find(work=>work.id===id)).filter((work):work is Business["work"][number]=>!!work) : [...data.work]
    .sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)||a.id.localeCompare(b.id))
    .filter(work=>Date.parse(work.start)<Date.parse(`${calendarDay}T00:00:00-06:00`)+86400000&&Date.parse(work.end)>Date.parse(`${calendarDay}T00:00:00-06:00`));
  const baseList = catalog ? catalog.ids.map(id=>source.find(r=>r.id===id)).filter((r):r is NonNullable<typeof r>=>!!r) :
    section === "Clientes"
      ? clients
      : section === "Inventario"
        ? products
        : work;
  // Area D: sortable columns on the price book. Orders the rows already loaded (the server keeps its own order for paging).
  const list = section==="Inventario"&&sortKey!=="default"?[...baseList].sort((a,b)=>{
    const x=a as Business["products"][number],y=b as Business["products"][number];
    const value=sortKey==="name"?x.name.localeCompare(y.name,'es'):sortKey==="cost"?x.cost-y.cost:sortKey==="price"?x.price-y.price:x.stock-y.stock;
    return (sortDir==="asc"?value:-value)||x.id.localeCompare(y.id);
  }):baseList;
  const labels =
    section === "Clientes"
      ? { all: tr("Activos", "Active"), archived: tr("Archivados", "Archived") }
      : section === "Inventario"
        ? {
            all: tr("Activos", "Active"),
            products:tr("Productos","Products"),
            services:tr("Servicios","Services"),
            low: ux("replenish"),
            archived: tr("Archivados", "Archived"),
          }
        : {
            all: tr("Todas", "All"),
            today: tr("Hoy", "Today"),
            upcoming: tr("Próximas", "Upcoming"),
            completed: tr("Finalizadas", "Completed"),
            cancelled: tr("Canceladas", "Cancelled"),
          };
  const createLabel =
    section === "Clientes"
      ? tr("Nuevo cliente", "New customer")
      : section === "Inventario"
        ? tr("Nuevo producto o servicio", "New product or service")
        : tr("Nueva cita", "New appointment");
  const Icon =
    section === "Clientes"
      ? Users
      : section === "Inventario"
        ? Package
        : CalendarDays;
  const customer = data.clients.find((c) => c.id === detail),
    product = data.products.find((p) => p.id === detail),
    appointment = data.work.find((w) => w.id === detail);
  const clientQuotes = (id: string) =>
    quotes.filter((q) =>
      data.quoteLinks.some((l) => l.quoteId === q.id && l.clientId === id),
    );
  const quoteOptions = quotes.filter(
    (q) =>
      q.status === "accepted" &&
      data.quoteLinks.some(
        (l) => l.quoteId === q.id && l.clientId === clientId,
      ),
  );
  async function exportView(){
                  setExportError("");
                  try {
                    const exported=agenda?await agenda.exportRows():catalog?await catalog.exportRows():null;
                    await downloadFile(
                      section === "Agenda"
                        ? exportWork(exported?.work??work)
                        : businessCsv(
                            section === "Clientes"
                              ? (exported?.clients??clients).map((c) => ({
                                  [tr("Nombre", "Name")]: c.name,
                                  [tr("Correo", "Email")]: c.email,
                                  [tr("Teléfono", "Phone")]: c.phone,
                                  [tr("Notas", "Notes")]: c.notes,
                                  [tr("Identificación","Identification")]:c.identification||"",
                                  [tr("Nombre comercial","Trading name")]:c.tradeName||"",
                                  [tr("Grupo","Group")]:c.group||"",
                                  [tr("Dirección","Address")]:c.address||"",
                                }))
                              : (exported?.products??products).map((p) => ({
                                  [tr("Código", "Code")]: p.sku,
                                  [tr("Producto", "Product")]: p.name,
                                  [tr("Tipo","Type")]:p.itemType==="service"?"service":"product",
                                  [tr("Existencias", "Stock")]: p.stock,
                                  [tr("Mínimo", "Minimum")]: p.minimum,
                                  [tr("Costo", "Cost")]: p.cost,
                                  [tr("Precio", "Price")]: p.price,
                                  [tr("Categoría","Category")]:p.category||"",
                                  [tr("Unidad","Unit")]:p.unit||"",
                                  CABYS:p.cabys||"",
                                })),
                          ),
                      `${section.toLowerCase()}.csv`,
                      "text/csv;charset=utf-8",
                    );
                  } catch {
                    setExportError(
                      tr(
                        "No se pudo exportar. En la app móvil, compruebe que tiene una versión actualizada.",
                        "Could not export. In the mobile app, check that your version is up to date.",
                      ),
                    );
                  }
  }
  if (section === "Redes") return <SocialPanel server />;
  return (
    <div data-business-panel="" className="space-y-4">
      {journeyDialog}
      {!dialogsOnly&&!jobRoute&&<>
      <SectionHeadline
        subtitulo={
          section === "Agenda"
            ? tr(
                "Organice sus citas en horario de Costa Rica.",
                "Manage appointments in Costa Rica time.",
              )
            : section === "Clientes"
              ? tr(
                  "Sus clientes y el historial de cada trabajo.",
                  "Your customers and their work history.",
                )
              : tr(
                  "Sus productos, servicios y existencias en un solo catálogo.",
                  "Your products, services and stock in one catalog.",
                )
        }
      >
        <div data-pro-actions="" className="w-full">
        <Button
          size="crear"
          disabled={!ready || saving}
          className="w-full"
          onClick={() => openEdit("new")}
        >
          <Plus className="h-4 w-4" />
          {createLabel}
        </Button>
        {ready && (section==="Agenda" ?
          <ProSectionActions><CardActionsMenu label={ux("sectionActions")} placement="down" triggerClassName="h-11 w-11 border-0 hover:border-transparent" actions={!saving&&list.length?[{label:tr("Exportar vista · CSV para Excel","Export view · CSV for Excel"),onClick:()=>void exportView()}]:[]}/></ProSectionActions>
          : <CatalogImport key={section} kind={section==="Clientes"?"clients":"products"} data={data} commit={catalog?.importCommit??commit} saving={saving}
              routeOpen={params.get("importar")==="1"} onRouteOpen={()=>pushProParams({importar:"1"})} onRouteClose={()=>closeProStep("importar")}
              renderTrigger={open=><ProSectionActions><CardActionsMenu label={ux("sectionActions")} placement="down" triggerClassName="h-11 w-11 border-0 hover:border-transparent" actions={saving?[]:[
                {label:tr("Importar CSV","Import CSV"),onClick:open},
                ...(section==="Clientes"?[{label:tr("Organizar clientes (vCard, duplicados, etiquetas)","Organize customers (vCard, duplicates, tags)"),onClick:()=>pushProParams({organizarClientes:"1"})}]:[]),
                ...(section==="Inventario"?[{label:tr("Administrar categorías","Manage categories"),onClick:()=>pushProParams({organizar:"product_category"})}]:[]),
                ...(list.length?[{label:tr("Exportar vista · CSV para Excel","Export view · CSV for Excel"),onClick:()=>void exportView()}]:[])
              ]}/></ProSectionActions>}/>
        )}
        </div>
      </SectionHeadline>
      {section==="Clientes"&&params.get("organizarClientes")==="1"&&<ContactsOrganizerDialog onClose={()=>closeProStep("organizarClientes")} onChanged={()=>latestReload.current()}/>}
      {(section==="Clientes"||section==="Inventario")&&<CatalogOrganizations kind={section==="Clientes"?"client_group":"product_category"} renderTrigger={()=>null}/>}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
        >
          {error}{" "}
          <Button variant="secondary" onClick={reload}>
            {tr("Recargar datos", "Reload data")}
          </Button>
        </p>
      )}
      {exportError && (
        <p role="alert" className="text-sm text-red-700">
          {exportError}
        </p>
      )}
      {quoteError && <p role="alert">{quoteError}</p>}
      {!ready && !error ? (
        <PanelListSkeleton rows={3} compacto withSearch />
      ) : (
        <>
          {section === "Agenda" && <>
            {agenda&&<>
              <div role="group" aria-label={ux("agendaView")}><StatusFilterTabs tabs={[{id:"day"},{id:"upcoming"}]} value={agenda.mode} onChange={value=>agenda.setMode(value as "day"|"upcoming")} labelFor={id=>agendaText(id as "day"|"upcoming")} variant="pills" limpiable={false}/></div>
              {agenda.mode==="upcoming"&&<div className="space-y-2"><p className="text-sm text-[#68778d]">{ux("upcomingScope")}</p><ProSearchField label={agendaText("search")} value={agenda.search} onChange={agenda.setSearch}/></div>}
            </>}
            {(!agenda||agenda.mode==="day")&&<>
            <AgendaCalendar remote={agenda} data={data} commit={commit} saving={saving} day={calendarDay} onDay={(day)=>{if(!day)return;setCalendarDay(day);setVisible(20);}}/>
            <div className="flex items-center justify-between gap-3"><h3 className="text-base font-bold first-letter:uppercase text-[#162543]">{new Date(`${calendarDay}T12:00:00-06:00`).toLocaleDateString(en?"en-US":"es-CR",{weekday:"long",day:"numeric",month:"long",timeZone:"America/Costa_Rica"})}</h3><Button variant="secondary" onClick={()=>setCalendarDay(today)}>{tr("Hoy","Today")}</Button></div>
            </>}
          </>}
          {section !== "Agenda" && <>
          {section==="Inventario"?<div className="space-y-2"><label className="block text-[13px] font-bold text-[#162543]">{ux("showProducts")}<select aria-label={ux("showProducts")} value={filter} onChange={event=>{setFilter(event.target.value);setVisible(20);}} className={field}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{filter==="low"&&<p className="text-sm text-[#68778d]">{ux("replenishHint")}</p>}{proSpace&&<div data-catalog-sort className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"><label className="block text-[13px] font-bold text-[#162543]">{tr("Ordenar por","Sort by")}<select aria-label={tr("Ordenar por","Sort by")} value={sortKey} onChange={event=>{setSortKey(event.target.value as typeof sortKey);setVisible(20);}} className={field}><option value="default">{tr("Orden original","Default order")}</option><option value="name">{tr("Nombre","Name")}</option><option value="cost">{tr("Costo","Cost")}</option><option value="price">{tr("Precio","Price")}</option><option value="stock">{tr("Existencias","Stock")}</option></select></label><button type="button" data-catalog-sort-dir disabled={sortKey==="default"} aria-label={tr("Invertir orden","Reverse order")} aria-pressed={sortDir==="desc"} onClick={()=>setSortDir(d=>d==="asc"?"desc":"asc")} className="min-h-11 rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm font-semibold text-[#162543] disabled:opacity-50">{sortDir==="asc"?tr("Ascendente","Ascending"):tr("Descendente","Descending")}</button></div>}{proSpace&&<CatalogColumnsPicker columns={catalogColumns} onChange={setCatalogColumns}/>}</div>:<StatusFilterTabs
            tabs={Object.keys(labels).map((id) => ({ id }))}
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setVisible(20);
            }}
            labelFor={(id) => labels[id as keyof typeof labels] || id}
            variant="pills"
            limpiable={false}
          />}
          <ProSearchField label={tr("Buscar registros", "Search records")} placeholder={section==="Clientes"?tr("Buscar cliente","Search customers"):tr("Buscar producto, servicio o código","Search product, service or code")} value={search} onChange={value=>{setSearch(value);setVisible(20);}}/>
          </>}
          {(search.trim()||(filter!=="all"&&filter!=="archived"))&&section!=="Agenda"&&<div><Button variant="ghost" onClick={()=>{setSearch("");setFilter(filter==="archived"?"archived":"all");setVisible(20);}}>{ux("clearFilters")}</Button></div>}
          {(catalog?.loading||agenda?.loading)&&!list.length ? <PanelListSkeleton rows={3} compacto/> : !list.length ? (
            <PanelEmptyState
              icon={Icon}
              title={agenda?.mode==="upcoming"?(agenda.search?ux("noMatches"):ux("noUpcoming")):section==="Inventario"&&filter==="low"&&!search?ux("nothingToReplenish"):tr(
                section === "Agenda" ? "No tiene citas este día" : "No hay registros en esta vista",
                section === "Agenda" ? "No appointments this day" : "No records in this view",
              )}
              description={agenda?.mode==="upcoming"?(agenda.search?ux("tryAnotherSearch"):agendaText("hint")):section==="Inventario"&&filter==="low"&&!search?ux("nothingToReplenishHint"):tr(
                section === "Agenda" ? "Seleccione otro día en el calendario o agregue una cita." : "Pruebe otro filtro o agregue el primero.",
                section === "Agenda" ? "Select another day in the calendar or add an appointment." : "Try another filter or add your first record.",
              )}
              action={section!=="Agenda"&&!search&&filter==="all"&&ready?<Button type="button" data-pro-empty-create disabled={!ready||saving} onClick={()=>openEdit("new")}><Plus className="h-4 w-4"/>{section==="Clientes"?tr("Agregar el primer cliente","Add your first customer"):tr("Agregar el primer producto o servicio","Add your first product or service")}</Button>:undefined}
            />
          ) : (
            <div className="space-y-2">
              {(catalog||agenda?list:list.slice(0, visible)).map((item) => {
                const c =
                    section === "Clientes"
                      ? data.clients.find((c) => c.id === item.id)
                      : undefined,
                  p =
                    section === "Inventario"
                      ? data.products.find((p) => p.id === item.id)
                      : undefined,
                  w =
                    section === "Agenda"
                      ? data.work.find((w) => w.id === item.id)
                      : undefined;
                const title =
                  c?.name ||
                  (p ? [p.name,p.sku].filter(Boolean).join(" · ") : `${w?.client} · ${w?.service}`);
                const subtitle = c
                  ? [c.tradeName, c.group, proPhone(c.phone), c.email].filter(Boolean).join(" · ")
                  : p
                    ? proSpace
                      ? [p.itemType==="service"?tr("Servicio","Service"):catalogColumns.includes("stock")?`${p.stock} ${p.unit||tr("unidades", "units")}`:"",
                         catalogColumns.includes("price")?money(p.price):"",
                         catalogColumns.includes("cost")?`${tr("Costo","Cost")} ${money(p.cost)}`:"",
                         catalogColumns.includes("margin")&&p.price>0?`${tr("Margen","Margin")} ${money(p.price-p.cost)} (${Math.round((p.price-p.cost)*100/p.price)} %)`:"",
                         p.itemType!=="service"&&p.minimum>0&&p.stock<=p.minimum?ux("replenish")+" · "+ux("minimum",{value:p.minimum}):""].filter(Boolean).join(" · ")
                      : p.itemType==="service"?`${tr("Servicio","Service")} · ${money(p.price)}`:`${p.stock} ${p.unit||tr("unidades", "units")} · ${money(p.price)}${p.minimum>0&&p.stock <= p.minimum ? " · " + ux("replenish") + " · " + ux("minimum",{value:p.minimum}) : ""}`
                    : workStatus(w!)+" · "+date(w!.start);
                const actions: CardAction[] = [
                  {
                    label: tr("Editar", "Edit"),
                    onClick: () => openEdit(item.id),
                  },
                ];
                if (c)
                  actions.push({
                    label: c.archived
                      ? tr("Restaurar", "Restore")
                      : tr("Archivar", "Archive"),
                    onClick: () =>
                      void apply(() =>
                        saveClient(data, { ...c, archived: !c.archived }),
                      ),
                  });
                if (p)
                  actions.push({
                    label: p.archived
                      ? tr("Restaurar", "Restore")
                      : tr("Archivar", "Archive"),
                    onClick: () =>
                      void apply(() =>
                        saveProduct(data, { ...p, archived: !p.archived }),
                      ),
                  });
                if (w && !w.cancelled && w.stage !== "completed")
                  actions.push(
                    {
                      label: tr("Finalizar", "Complete"),
                      onClick: () =>
                        void apply(() =>
                          saveAppointment(data, { ...w, stage: "completed" }),
                        ),
                    },
                    {
                      label: tr("Cancelar cita", "Cancel appointment"),
                      destructive: true,
                      onClick: () =>
                        void apply(() =>
                          saveAppointment(data, { ...w, cancelled: true }),
                        ),
                    },
                  );
                return <ProRecordCard
                  key={item.id} icon={Icon} title={title} subtitle={subtitle}
                  meta={p&&proSpace?(catalogColumns.includes("chips")?<CatalogListChips productId={p.id}/>:undefined):c?.identification || (w ? (w.cancelled ? tr("Cancelada","Cancelled") : w.stage === "completed" ? tr("Finalizada","Completed") : tr("Agendada","Scheduled")) : undefined)}
                  onOpen={() => void openDetail(item.id)}
                  openLabel={c ? tr("Ver cliente","View customer") : p ? (p.itemType === "service" ? tr("Ver servicio","View service") : tr("Ver producto","View product")) : tr("Ver cita","View appointment")}
                  onEdit={() => openEdit(item.id)} editLabel={tr("Editar","Edit")}
                  actions={actions.slice(1)} actionsLabel={tr("Opciones de ","Options for ")+title} disabled={saving}
                />;
              })}
            </div>
          )}
          {(agenda?agenda.hasMore:catalog?catalog.hasMore:visible < list.length) && (
            <div ref={sentinel}>
              <Button
                variant="secondary"
                disabled={!!error||catalog?.loading||agenda?.loading}
                onClick={() => agenda?agenda.more():catalog?catalog.more():setVisible((v) => v + 20)}
              >
                {tr("Ver más", "Show more")}
              </Button>
            </div>
          )}

        </>
      )}
      </>}
      {detail && !params.get("fiscalCliente") && (
        <ProFormFooterProvider scope={{actorId:accountId,workId:appointment?.id??detail,view:params.get("vistaTrabajo")??"summary"}} enabled={!!appointment&&params.get("vistaTrabajo")==="updates"&&!filesState.dirty&&!filesState.busy}>
        <DetailFrame
          manageFocus={!!appointment}
          title={customer?.name || product?.name || appointment?.service || (jobRoute?tr("Trabajo","Job"):ux("recordTitle"))}
          ariaLabel={customer?.name || product?.name || appointment?.service || ux("recordTitle")}
          onClose={closeDetail}
          size={appointment?(agenda&&proSpace?"page":"xl"):"md"}
          backLabel={appointment&&agenda&&proSpace?tr("Volver","Back"):undefined}
          onBack={appointment&&agenda&&proSpace?leaveJobPage:undefined}
          mobilePresentation="fullscreen"
          closeLabel={tr("Cerrar", "Close")}
          footer={
            <ProFormFooterSlot fallback={<Button
              disabled={nestedBlocked||finishing||detailBusy||detailFailed||!(customer||product||appointment)}
              onClick={() => {
                setDetail(null);
                openEdit(detail);
              }}
            >
              {/* En el trabajo el pie sigue visible en todas sus vistas (Cotizaciones, Vista del cliente…): el nombre dice qué se edita. */}
              {appointment ? tr("Editar trabajo", "Edit job") : tr("Editar", "Edit")}
            </Button>}/>
          }
        >
          {detailBusy&&<p role="status" className="text-sm text-[#68778d]">{ux("loadingRecord")}</p>}
          {!detailBusy&&(detailFailed||!(customer||product||appointment))&&<div className="space-y-3"><p role="alert">{ux("recordUnavailable")}</p><Button variant="secondary" onClick={()=>void openDetail(detail)}>{ux("retry")}</Button></div>}
          {customer && !detailFailed && (
            <div className="space-y-5">
              <p className="break-words text-sm text-[#52627a]">
                {[proPhone(customer.phone), customer.email].filter(Boolean).join(" · ")}
              </p>
              {[customer.identification,customer.tradeName,customer.group,customer.address].filter(Boolean).map((value,index)=><p key={index} className="break-words text-sm text-[#52627a]">{value}</p>)}
              {customer.notes && (
                <p className="whitespace-pre-wrap break-words">
                  {customer.notes}
                </p>
              )}
              {catalog && <ClientContactExtras key={"extras:"+customer.id} clientId={customer.id} disabled={customer.archived||writeBlocked}/>}
              {!customer.archived && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      navigate("quotes", { nueva: "1", cliente: customer.id })
                    }
                  >
                    {tr("Crear cotización", "Create quote")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      navigate("pro_agenda", {
                        nueva: "1",
                        cliente: customer.id,
                      })
                    }
                  >
                    {tr("Agendar cita", "Schedule appointment")}
                  </Button>
                </div>
              )}
              {catalog && <><ClientAccountStatement key={"statement:"+customer.id} clientId={customer.id}/><details data-client-fiscal-options className="rounded-xl border border-[#d7e1ea] p-3"><summary className="cursor-pointer text-sm font-semibold">{simple("invoiceOptional")}</summary><div className="mt-3"><Button type="button" variant="secondary" onClick={()=>pushProParams({fiscalCliente:customer.id})}>{tr("Datos para facturas","Invoice details")}</Button></div></details></>}
              {catalog && proSpace && !customer.archived && <ClientWorkAccess key={"access:"+customer.id} clientId={customer.id}/>}
              {catalog && <ClientPending key={"pending:"+customer.id} clientId={customer.id} onRequest={id=>navigate("pro_agenda",{citaSolicitud:id})} onWork={id=>navigate("pro_agenda",{cita:id})} onQuote={(id,legacy)=>navigate("quotes",{cotizacion:id,volverCliente:currentProPath(),...(legacy?{legacy:"1"}:{})})}/>}
              {/* B6 (2026-11-12) + Ronda 4B: «Trabajos y saldos» is visible while the account-scoped
                  list loads, but ClientOperations (job costs, recovery) mounts only with the account. */}
              {catalog && !accountId && <section data-client-operations="" data-client-operations-pending="" aria-label={tr("Trabajos y saldos","Jobs and balances")} className="space-y-3"><h3 className="font-bold">{tr("Trabajos y saldos","Jobs and balances")}</h3><p role="status" className="text-sm text-[#68778d]">{tr("Cargando trabajos…","Loading jobs…")}</p></section>}
              {catalog && accountId && <ClientOperations key={"operations:"+operationsOwner.generation+":"+customer.id} accountId={accountId} clientId={customer.id} archived={customer.archived} onBlockedChange={setOperationsBlocked} onChanged={reload} onQuote={(id,legacy)=>navigate("quotes",{cotizacion:id,volverCliente:currentProPath(),...(legacy?{legacy:"1"}:{})})}/>}
              {catalog ? <ClientHistory key={customer.id} clientId={customer.id} onWork={id=>navigate("pro_agenda",{cita:id})} onQuote={(id,legacy)=>navigate("quotes",{cotizacion:id,volverCliente:currentProPath(),...(legacy?{legacy:"1"}:{})})}/> : <>
              <h3 className="font-bold">{tr("Cotizaciones", "Quotes")}</h3>
              {clientQuotes(customer.id).map((q) => (
                <button
                  key={q.id}
                  className="block w-full rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-left text-[15px] text-[#162543]"
                  onClick={() => navigate("quotes", { cotizacion: q.id })}
                >
                  {q.title} · {money(q.total)}
                </button>
              ))}
              {data.quotes
                .filter((q) => q.clientId === customer.id)
                .map((q) => (
                  <button
                    key={q.id}
                    className="block w-full rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-left text-[15px] text-[#162543]"
                    onClick={() => navigate("quotes", { cotizacion: q.id })}
                  >
                    {q.title}
                  </button>
                ))}
              {!clientQuotes(customer.id).length &&
                !data.quotes.some((q) => q.clientId === customer.id) && (
                  <p className="text-sm text-[#68778d]">
                    {tr("Todavía no hay cotizaciones.", "No quotes yet.")}
                  </p>
                )}
              <h3 className="font-bold">{tr("Trabajos y citas", "Jobs and appointments")}</h3>
              {data.work
                .filter((w) => w.clientId === customer.id)
                .map((w) => (
                  <button
                    type="button" key={w.id} data-client-work={w.id} disabled={nestedBlocked}
                    aria-label={tr("Abrir trabajo","Open job")+": "+w.service}
                    onClick={()=>{if(!nestedBlocked)navigate("pro_agenda",{cita:w.id});}}
                    className="block w-full rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-left text-[15px] text-[#52627a] hover:bg-[#f7fafc] disabled:opacity-50"
                  >
                    {w.service} · {date(w.start)} · {proSpace?<WorkPhaseText workId={w.id} fallback={workStatus(w)}/>:workStatus(w)}
                  </button>
                ))}
              {!data.work.some((w) => w.clientId === customer.id) && (
                <p className="text-sm text-[#68778d]">
                  {tr("Todavía no hay trabajos ni citas.", "No jobs or appointments yet.")}
                </p>
              )}
              </>}
            </div>
          )}
          {product && !detailFailed && (
            <div className="space-y-4">
              <p className="break-words text-sm text-[#52627a]">{[product.category,product.unit].filter(Boolean).join(" · ")}</p>
              <p>
                {product.sku} · {product.itemType==="service"?tr("Servicio sin existencias","Service without stock"):`${product.stock} ${product.unit||tr("unidades", "units")}`}
              </p>
              {product.itemType!=="service"&&<p className="text-sm text-[#52627a]">{ux("minimum",{value:product.minimum})}{product.minimum>0&&product.stock<=product.minimum&&` · ${ux("replenish")}`}</p>}
              <p>
                {tr("Precio", "Price")}: {money(product.price)} ·{" "}
                {tr("Costo", "Cost")}: {money(product.cost)}
              </p>
              {/* Round 7B: margin per item, over the sale price (same basis as the quote editor). */}
              {product.price>0&&<p data-product-margin className="text-sm text-[#52627a]">{tr("Margen", "Margin")}: {money(product.price-product.cost)} · {new Intl.NumberFormat(tr("es-CR","en-US"),{maximumFractionDigits:1}).format((product.price-product.cost)/product.price*100)} %</p>}
              {/* Round 7C: image and preferred vendor of the item (Pro space). */}
              {proSpace&&<CatalogItemExtras key={"extras:"+product.id} productId={product.id}/>}
              {proSpace&&<CatalogItemSpecs key={"specs:"+product.id} productId={product.id}/>}
              {proSpace&&<CatalogItemPricing key={"pricing:"+product.id} productId={product.id}/>}
              {proSpace&&<CatalogItemKind key={"kind:"+product.id} productId={product.id}/>}
              {product.cabys&&<details className="rounded-2xl border border-[#e5e7eb] p-4" data-product-detail-fiscal-reference><summary className="cursor-pointer font-bold text-[#162543]">{tr("Referencia fiscal","Tax reference")}</summary><p className="mt-4 break-words text-sm text-[#52627a]">{tr("Código CABYS","CABYS code")}: {product.cabys}</p></details>}
              {!product.archived && product.itemType!=="service" && (
                <Button
                  onClick={() => {
                    pushProParams({movimiento:product.id});
                    setStock(product.id);
                    setDetail(null);
                  }}
                >
                  {tr("Registrar movimiento", "Record stock movement")}
                </Button>
              )}
              {product.itemType!=="service"&&<>
              <h3 className="font-bold">
                {tr("Historial de movimientos", "Stock history")}
              </h3>
              {!data.movements.some(m=>m.productId===product.id)&&<p className="text-sm text-[#68778d]">{ux("noMovements")}</p>}
              {(catalog?data.movements:[...data.movements].reverse())
                .filter((m) => m.productId === product.id)
                .map((m) => (
                  <p key={m.id} className="border-b py-3">
                    {m.delta > 0 ? "+" : ""}
                    {m.delta} · {m.reason}
                    <span className="block text-xs text-[#68778d]">
                      {date(m.at)}
                    </span>
                  </p>
                ))}
              {catalog?.hasMoreMovements&&<Button variant="secondary" onClick={catalog.moreMovements}>{tr("Ver más movimientos","Show more movements")}</Button>}</>}
            </div>
          )}
          {appointment && !detailFailed && (
            <div data-job-page={agenda&&proSpace?"":undefined} className={"space-y-4"+(agenda&&proSpace?" mx-auto w-full max-w-[90rem]":"")}>
              {nestedWarning&&nestedBlocked&&<p role="alert">{tr("Guarde o cancele los cambios del trabajo antes de salir.","Save or cancel job changes before leaving.")}</p>}
              {/* Round 9: in the Pro space the customer, phase and dates share one line (they were three lines above the menu). */}
              {agenda&&proSpace?<div data-job-header-line className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#52627a]"><span data-job-client className="min-w-0 break-words font-semibold text-[#162543]">{appointment.client}</span><WorkHeader compact key={"header:"+appointment.id} workId={appointment.id} fallbackStage={workStatus(appointment)} period={{start:appointment.start,end:appointment.end,format:date}}/></div>:<>
              <p>{appointment.client}</p>
              <p data-work-stage>{workStatus(appointment)}</p>
              <p data-work-period>
                {!appointment.start&&!appointment.end?tr("Sin programar","Not scheduled"):<>{date(appointment.start)} — {date(appointment.end)}</>}
              </p></>}
              <JobWorkspace key={appointment.id} workId={agenda?appointment.id:undefined} blocked={nestedBlocked} aside={agenda&&proSpace?<WorkSidebar key={"sidebar:"+appointment.id} workId={appointment.id} disabled={nestedBlocked} onOpen={view=>pushProParams({vistaTrabajo:view})}/>:null} files={agenda&&proSpace?<WorkFileOrganizer key={"organizer:"+appointment.id} workId={appointment.id}/>:null} subs={agenda&&proSpace?<WorkSubcontractors key={"subs:"+appointment.id} workId={appointment.id}/>:null} overview={agenda&&proSpace?<WorkOverview key={"overview:"+appointment.id} workId={appointment.id} dated={!!(appointment.start||appointment.end)} period={appointment.start||appointment.end?`${date(appointment.start)} — ${date(appointment.end)}`:""} disabled={nestedBlocked} onOpen={view=>pushProParams({vistaTrabajo:view})}/>:null} contracts={agenda&&proSpace?<WorkContracts key={"contracts:"+appointment.id} workId={appointment.id} onStateChange={setContractsState} onOpenClientView={()=>pushProParams({vistaTrabajo:"client"})}/>:null} estimates={agenda&&proSpace&&accountId&&appointment.clientId?<ProjectEstimates key={"estimates:"+appointment.id} actor={accountId} workId={appointment.id} clientId={appointment.clientId} cancelled={appointment.cancelled} blocked={nestedBlocked||saving||finishing||!!editing}/>:null} allowances={agenda&&proSpace?<WorkAllowances key={"allowances:"+appointment.id} workId={appointment.id} onStateChange={setAllowancesState} onOpenChanges={()=>pushProParams({vistaTrabajo:"changes"})}/>:null} selections={agenda&&proSpace?<><WorkSelections key={"selections:"+appointment.id} workId={appointment.id} onStateChange={setSelectionsState} onOpenClientView={()=>pushProParams({vistaTrabajo:"client"})}/><SelectionTrackingPanel key={"tracking:"+appointment.id} workId={appointment.id}/><SelectionVisibilityPanel key={"visibility:"+appointment.id} workId={appointment.id}/></>:null} moodboards={agenda&&proSpace?<WorkMoodBoards key={"moodboards:"+appointment.id} workId={appointment.id} onStateChange={setMoodBoardsState} onOpenClientView={()=>pushProParams({vistaTrabajo:"client"})}/>:null} takeoffs={agenda&&proSpace?<div className="space-y-6"><WorkTakeoffs key={"takeoffs:"+appointment.id} workId={appointment.id} onStateChange={setTakeoffsState}/><WorkFloorPlans key={"floorplans:"+appointment.id} workId={appointment.id}/></div>:null} budget={agenda&&proSpace?<WorkBudgetForecast key={"budget:"+appointment.id} workId={appointment.id} blocked={nestedBlocked}/>:null} orders={agenda&&proSpace?<WorkPurchaseOrders key={"orders:"+appointment.id} workId={appointment.id} onStateChange={setOrdersState}/>:null} invoices={agenda&&proSpace?<WorkInvoices key={"invoices:"+appointment.id} workId={appointment.id}/>:null} credits={agenda&&proSpace?<WorkCredits key={"credits:"+appointment.id} workId={appointment.id} onStateChange={setCreditsState}/>:null} bids={agenda&&proSpace?<WorkBids key={"bids:"+appointment.id} workId={appointment.id} onStateChange={setBidsState}/>:null} schedule={agenda&&proSpace?<><ProjectSchedule key={"schedule:"+appointment.id} workId={appointment.id} onStateChange={setScheduleState}/><ScheduleLinksPanel key={"links:"+appointment.id} workId={appointment.id}/></>:null} time={agenda&&proSpace&&appointment.clientId?<TimeTracking key={"time:"+appointment.id} workId={appointment.id} onStateChange={setTimeState}/>:null} client={agenda?<ClientDashboardEditor key={"client:"+appointment.id} workId={appointment.id} onStateChange={setClientViewState} renderPreview={requestId=><ClientWorkSections key={"preview:"+requestId} requestId={requestId}/>}/>:null} messages={agenda&&proSpace?<WorkMessages key={"messages:"+appointment.id} workId={appointment.id}/>:null} updates={agenda?<div className="space-y-6"><WorkUpdates key={"updates:"+appointment.id} workId={appointment.id} onStateChange={setUpdatesState}/><WorkFiles key={"files:"+appointment.id} workId={appointment.id} onStateChange={setFilesState}/></div>:null} tasks={agenda?<WorkTasks key={"tasks:"+appointment.id} initialStatus={params.get("workTaskStatus")==="done"?"done":"open"} workId={appointment.id} onStateChange={setTaskState}/>:null} summary={<>
              {agenda&&<section data-work-next-step className="rounded-xl bg-[#f3f8fb] p-4"><h3 className="font-semibold">{simple("nextStep")}</h3><p className="mt-1 text-sm text-[#52627a]">{!appointment.start&&!appointment.end&&!appointment.cancelled&&appointment.stage!=="completed"?(proSpace?<WorkQuoteNextStep workId={appointment.id} fallback={tr("Prepare y comparta la cotización con su cliente; después planifique las fechas.","Prepare and share the quote with your customer, then plan the dates.")}/>:tr("Prepare y comparta la cotización con su cliente; después planifique las fechas.","Prepare and share the quote with your customer, then plan the dates.")):simple(appointment.cancelled?"cancelledJob":appointment.stage==="completed"?(appointment.clientId?"afterVisit":"completedAction"):"beforeVisit")}</p>{/* Round 7A: a new job without dates never offers «Finish job» as its next step. */}{!appointment.start&&!appointment.end&&!appointment.cancelled&&appointment.stage!=="completed"&&proSpace&&<Button type="button" data-work-next-action="estimates" className="mt-3" disabled={nestedBlocked||saving||finishing||!!editing} onClick={()=>pushProParams({vistaTrabajo:"estimates"})}>{tr("Abrir cotizaciones","Open quotes")}</Button>}{!appointment.cancelled&&appointment.stage!=="completed"&&(appointment.start||appointment.end)&&<Button type="button" data-work-finish className="mt-3" disabled={nestedBlocked||saving||finishing||!!editing} onClick={()=>void finishWork(appointment)}>{journey("finish")}</Button>}{!appointment.cancelled&&appointment.stage==="completed"&&!!appointment.clientId&&<Button type="button" className="mt-3" disabled={nestedBlocked||saving||finishing||!!editing} onClick={()=>pushProParams({vistaTrabajo:"costs"})}>{simple("balancePayments")}</Button>}{finishError&&<p role="alert" className="mt-2 text-sm text-red-700">{finishError}</p>}</section>}

              {agenda&&proSpace&&<WorkClientInvite key={"invite:"+appointment.id} workId={appointment.id}/>}
              {agenda&&!appointment.cancelled&&appointment.stage!=="completed"&&!appointment.start&&!appointment.end&&<div className="flex flex-wrap items-center gap-2 text-sm text-[#52627a]"><span>{tr("¿Ya terminó este trabajo?","Already done with this job?")}</span><Button type="button" data-work-finish variant="outline" disabled={nestedBlocked||saving||finishing||!!editing} onClick={()=>void finishWork(appointment)}>{journey("finish")}</Button></div>}
              <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={nestedBlocked} onClick={()=>navigate("pro_clients",{cliente:appointment.clientId})}>{tr("Ver cliente","View customer")}</Button>
              {/* Round 8: from Mi panel the job also opens as its own page in the Pro space. */}
              {agenda&&!proSpace&&<Button variant="secondary" data-open-job-page disabled={nestedBlocked} onClick={()=>openProSection("pro_agenda",{cita:appointment.id},en)}>{tr("Abrir página del trabajo","Open job page")}</Button>}
              {(appointment.quoteId || appointment.externalQuoteId) && (
                <Button
                  variant="secondary"
                  disabled={nestedBlocked}
                  onClick={() =>
                    navigate("quotes", {
                      cotizacion:
                        appointment.externalQuoteId || appointment.quoteId!,
                      ...(!appointment.externalQuoteId&&appointment.quoteId?{legacy:"1"}:{}),
                    })
                  }
                >
                  {tr("Ver cotización", "View quote")}
                </Button>
              )}
              </div>
              {agenda&&<details data-job-tools className="rounded-xl border border-[#d7e1ea] p-3"><summary className="cursor-pointer text-sm font-semibold">{simple("moreJobTools")}</summary><div className="mt-3 flex flex-wrap gap-2"><InvoiceDraftAction kind="work" sourceId={appointment.id} secondary={false} disabled={nestedBlocked||appointment.cancelled}/>
              {agenda&&<Button variant="secondary" disabled={nestedBlocked} onClick={()=>pushProParams({vistaTrabajo:"costs"})}>{tr("Ver costos y resultado","View costs and result")}</Button>}</div></details>}
              {agenda&&accountId&&<WorkAcceptedEstimate key={accountId+":"+appointment.id} actor={accountId} workId={appointment.id} blocked={baseNestedBlocked||saving||finishing||!!editing} onStateChange={setAcceptedEstimateState}/>}
              {agenda&&appointment.bookingClientId&&/^[0-9a-f-]{36}$/i.test(appointment.id)&&<AppointmentReschedule key={"reschedule:"+appointment.id} requestId={appointment.id} optional readOnly={appointment.cancelled||appointment.stage==="completed"} onStateChange={setRescheduleState}/>}
              </>} costs={agenda&&accountId&&appointment.clientId?<ClientOperations key={"work-account:"+appointment.id} accountId={accountId} clientId={appointment.clientId} embeddedWorkId={appointment.id} archived={false} onBlockedChange={setOperationsBlocked} onChanged={reload} onQuote={(id,legacy)=>navigate("quotes",{cotizacion:id,volverCliente:currentProPath(),...(legacy?{legacy:"1"}:{})})}/>:null}
              changes={agenda?<WorkChanges key={"changes:"+appointment.id} workId={appointment.id} onStateChange={setChangeState} onSetAgreement={()=>pushProParams({vistaTrabajo:"costs",registro:"agreement"})}/>:null}
              notes={agenda&&proSpace?<div className="space-y-6"><ProjectNotes key={"notes:"+appointment.id} workId={appointment.id} clientName={appointment.client} onStateChange={setNotesState}/><WorkMeetings key={"meetings:"+appointment.id} workId={appointment.id}/><WorkProjectEmail key={"email:"+appointment.id} workId={appointment.id}/></div>:null} details={agenda&&proSpace?<ProjectDetails key={"details:"+appointment.id} workId={appointment.id} onStateChange={setDetailsState}/>:null}
              delivery={agenda?<WorkDelivery key={"delivery:"+appointment.id} workId={appointment.id} onStateChange={setDeliveryState}/>:null}/>



            </div>
          )}
        </DetailFrame>
        </ProFormFooterProvider>
      )}
      {editing&&!editReady&&<Modal title={editing==="new"?createLabel:ux("recordTitle")} onClose={()=>void requestFormClose(closeEdit,formDirty.current)} closeLabel={tr("Cerrar","Close")} mobilePresentation="fullscreen"><p role={editFailed?"alert":"status"}>{ux(editFailed?"recordUnavailable":"loadingRecord")}</p>{editFailed&&<Button variant="secondary" onClick={()=>setEditRetry(value=>value+1)}>{ux("retry")}</Button>}</Modal>}
      {editing && editReady && (
        <Modal
          ariaLabel={editing==="new"?createLabel:section==="Clientes"?forms("editCustomer"):section==="Inventario"?forms("editProduct"):forms("editAppointment")}
          title={
            editing === "new"
              ? createLabel
              : section==="Clientes"?forms("editCustomer"):section==="Inventario"?forms("editProduct"):forms("editAppointment")
          }
          onClose={()=>void requestFormClose(closeEdit,formDirty.current)}
          closeLabel={tr("Cerrar", "Close")}
          size="md"
          mobilePresentation="fullscreen"
          footerNotice={
            formError || error ? (
              <p role="alert" className="text-sm text-red-700">
                {formError || error}
                {!formError && error && !saving && !writeBlocked && (
                  <>{" "}<Button type="button" variant="secondary" onClick={reload}>{tr("Recargar datos", "Reload data")}</Button></>
                )}
              </p>
            ) : undefined
          }
          footer={
            <><Button type="button" variant="secondary" disabled={saving||writeBlocked} onClick={()=>void requestFormClose(closeEdit,formDirty.current)}>{tr("Cancelar","Cancel")}</Button><Button type={writeBlocked?"button":"submit"} form="pro-business-form" disabled={saving||writeBlocked&&!(clientRecovery?.attempt||inventoryRecovery?.attempt)} onClick={writeBlocked?()=>{if(inventoryBlocked)void inventoryRef.current?.retry().then(saved=>{if(saved)setInventoryDone('form');});else void recoveryRef.current?.retry().then(saved=>{if(saved)setClientDone(true);});}:undefined}>
              {saving ? tr("Guardando…", "Saving…") : writeBlocked?tr("Comprobar guardado","Check saved result"):tr("Guardar", "Save")}
            </Button></>
          }
        >
          <form
            id="pro-business-form"
            key={editing}
            onChange={(e) => persist(e.currentTarget)}
            onSubmit={submit}
            className="space-y-4"
          >
            {inventoryBlocked&&<p data-inventory-write-recovery role="status" className="text-sm text-[#52627a]">{saving?tr("Guardando…","Saving…"):tr("Compruebe el guardado antes de continuar.","Check the saved result before continuing.")}</p>}
            {clientBlocked&&<p data-client-write-recovery role="status" className="text-sm text-[#52627a]">{saving?tr("Guardando el cliente…","Saving the customer…"):tr("Compruebe el guardado antes de continuar.","Check the saved result before continuing.")}</p>}
            <fieldset disabled={saving||writeBlocked} className="min-w-0 space-y-4">
            {section === "Clientes" && (
              <>
                <ClientIdentification initialValue={value("identification")} autoLookup={editing==="new"&&!clientBlocked} disabled={saving||writeBlocked} className={field} onPrefill={prefillClient} onIdentificationChange={clearClientAutofill} onExisting={id=>openEdit(id,true)}/>
                {input("name", tr("Nombre", "Name"))}
                {input("email", tr("Correo", "Email"), "email", false)}
                <PhoneInput
                  id="pro-client-phone"
                  language={locale}
                  className="[&>div]:h-[46px]"
                  label={tr("Teléfono", "Phone")}
                  value={phone}
                  onChange={setPhone}
                />
                <details className="rounded-2xl border border-[#e5e7eb] p-4"><summary className="cursor-pointer font-bold text-[#162543]">{tr("Datos del negocio (opcionales)","Business details (optional)")}</summary><div className="mt-4 grid gap-4">{input("tradeName",tr("Nombre comercial","Trading name"),"text",false)}<OrganizationSelect kind="client_group" name="group" value={value("group")} label={tr("Grupo de clientes","Customer group")} disabled={saving} onChange={next=>changeOrganization("group",next)}/>{input("address",tr("Dirección","Address"),"text",false)}</div></details>
                <label className="block text-[13px] font-bold">
                  {tr("Notas", "Notes")}
                  <textarea
                    name="notes"
                    aria-label={tr("Notas","Notes")}
                    defaultValue={value("notes")}
                    maxLength={2000}
                    className={field}
                  />
                </label>
              </>
            )}
            {section === "Inventario" && (
              <>
                {editing==="new"?<label className="block text-[13px] font-bold">{tr("Tipo de registro","Item type")}<select name="itemType" aria-label={tr("Tipo de registro","Item type")} value={catalogItemType} onChange={e=>setCatalogItemType(e.target.value as "product"|"service")} className={field}><option value="product">{tr("Producto","Product")}</option><option value="service">{tr("Servicio","Service")}</option></select></label>:<p className="text-sm text-[#68778d]">{catalogItemType==="service"?tr("Servicio · sin control de existencias","Service · no stock tracking"):tr("Producto · con control de existencias","Product · stock tracking")}</p>}
                {input("name", tr("Nombre", "Name"))}
                {input(
                  "price",
                  tr("Precio unitario ₡", "Unit price ₡"),
                  "number",
                )}
                {catalogItemType==="service"&&<p className="text-sm text-[#68778d]">{tr("Se reutiliza en cotizaciones. No lleva control de existencias.","Reuse in quotes. No stock tracking is needed.")}</p>}
                {editing === "new" && catalogItemType!=="service" &&
                  input(
                    "stock",
                    tr("Existencias iniciales", "Initial stock"),
                    "number", false,
                  )}
                {catalogItemType!=="service"&&input("minimum", tr("Mínimo", "Minimum"), "number", false)}
                {input("cost", tr("Costo unitario ₡", "Unit cost ₡"), "number", false)}
                <details className="rounded-2xl border border-[#e5e7eb] p-4"><summary className="cursor-pointer font-bold text-[#162543]">{tr("Datos del catálogo (opcionales)","Catalog details (optional)")}</summary><div className="mt-4 grid gap-4">{input("sku",tr("Código","Code"),"text",false)}<OrganizationSelect kind="product_category" name="category" value={value("category")} label={tr("Categoría","Category")} disabled={saving} onChange={next=>changeOrganization("category",next)}/>{input("unit",tr("Unidad de medida","Unit of measure"),"text",false)}</div></details><details className="rounded-2xl border border-[#e5e7eb] p-4" data-product-fiscal-reference><summary className="cursor-pointer font-bold text-[#162543]">{tr("Referencia fiscal (opcional)","Tax reference (optional)")}</summary><div className="mt-4">{input("cabys",tr("Código CABYS","CABYS code"),"text",false)}</div><p className="mt-3 text-xs text-[#68778d]">{tr("CABYS se guarda como referencia; no valida la clasificación ni emite una factura.","CABYS is saved for reference; this does not validate the classification or issue an invoice.")}</p></details>
              </>
            )}
            {section === "Agenda" && (
              <>
                {agenda?<CatalogSelect kind="clients" label={tr("Cliente","Customer")} name="clientId" required value={clientId} selected={data.clients.find(c=>c.id===clientId)} onRows={agenda.clients} onChange={c=>{setClientId(c?.id||"");setSelectedQuote("");setLegacyQuote("");}}/>:<>
                <label className="block text-[13px] font-bold">
                  {tr("Cliente", "Customer")}
                  <select
                    aria-label={tr("Cliente", "Customer")}
                    name="clientId"
                    value={clientId}
                    required
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setSelectedQuote("");
                      setLegacyQuote("");
                    }}
                    className={field}
                  >
                    <option value="">
                      {tr("Seleccione un cliente", "Choose a customer")}
                    </option>
                    {data.clients
                      .filter((c) => !c.archived || c.id === row?.clientId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                </>}
                <label className="block text-[13px] font-bold">
                  {tr("Trabajo", "Work")}
                  <input
                    name="service"
                    required
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    className={field}
                  />
                </label>
                {input(
                  "start",
                  tr("Inicio · Costa Rica", "Start · Costa Rica"),
                  "datetime-local",!allowEmptyWorkDates,
                )}
                {input(
                  "end",
                  tr("Final · Costa Rica", "End · Costa Rica"),
                  "datetime-local",!allowEmptyWorkDates,
                )}
                {allowEmptyWorkDates&&<p className="text-sm text-[#68778d]">{row?.stage==='new'||row?.stage==='quoting'?tr("Puede dejar ambas fechas vacías para programarlo después. Si define un nuevo horario, el trabajo quedará agendado.","Leave both dates blank to schedule later. Setting a new time schedules the job."):tr("Puede conservar el trabajo sin fechas registradas.","You can keep this job without recorded dates.")}</p>}
                <div role="group" aria-label={forms("duration")} className="space-y-2"><p className="text-sm text-[#68778d]">{forms("duration")}</p><div className="grid grid-cols-3 gap-2">{[30,60,120].map(minutes=><Button key={minutes} type="button" variant="secondary" onClick={event=>{const form=event.currentTarget.closest('form');if(!form)return;const start=form.elements.namedItem('start') as HTMLInputElement,end=form.elements.namedItem('end') as HTMLInputElement;const at=Date.parse(start.value+'-06:00');if(!Number.isFinite(at)){start.focus();start.reportValidity();return;}end.value=agendaWallTime(new Date(at+minutes*60000).toISOString());persist(form);}}>{forms("minutes",{count:minutes})}</Button>)}</div></div>
                <input type="hidden" name="quoteId" value={legacyQuote} />
                <input
                  type="hidden"
                  name="externalQuoteId"
                  value={selectedQuote}
                />
                {agenda?<AppointmentQuoteSelect clientId={clientId} value={selectedQuote?"quote:"+selectedQuote:legacyQuote} onRows={rows=>{for(const row of rows)if(!row.legacy)agenda.quote({...row,id:row.id.replace(/^quote:/,"")});const chosen=rows.find(r=>r.id===(selectedQuote?"quote:"+selectedQuote:legacyQuote));if(chosen&&editing==="new")setService(current=>current||chosen.title);}} onChange={q=>{setSelectedQuote(q&&!q.legacy?q.id.replace(/^quote:/,""):"");setLegacyQuote(q?.legacy?q.id:"");if(q&&!service)setService(q.title);}}/>:<>
                <label className="block text-[13px] font-bold">
                  {tr(
                    "Cotización aceptada (opcional)",
                    "Accepted quote (optional)",
                  )}
                  <select
                    aria-label={tr(
                      "Cotización aceptada (opcional)",
                      "Accepted quote (optional)",
                    )}
                    value={
                      selectedQuote ? "quote:" + selectedQuote : legacyQuote
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedQuote(
                        value.startsWith("quote:") ? value.slice(6) : "",
                      );
                      setLegacyQuote(value.startsWith("quote:") ? "" : value);
                    }}
                    className={field}
                  >
                    <option value="">{tr("Sin cotización", "No quote")}</option>
                    {quoteOptions.map((q) => (
                      <option key={q.id} value={"quote:" + q.id}>
                        {q.title}
                      </option>
                    ))}
                    {data.quotes
                      .filter(
                        (q) =>
                          q.status === "accepted" && q.clientId === clientId,
                      )
                      .map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.title}
                        </option>
                      ))}
                  </select>
                </label>                </>}

              </>
            )}
            </fieldset>
          </form>
        </Modal>
      )}
      {stock && (inventoryInput?.rows[0]??data.products.find(p=>p.id===stock))?.itemType!=="service" && (
        <Modal
          title={tr("Registrar movimiento", "Record stock movement")}
          ariaLabel={tr("Registrar movimiento", "Record stock movement")}
          mobilePresentation="fullscreen"
          closeLabel={tr("Cerrar", "Close")}
          onClose={()=>void requestFormClose(closeStock,stockDirty.current)}
          footerNotice={
            formError || error ? (
              <p role="alert" className="text-red-700">
                {formError || error}
              </p>
            ) : undefined
          }
          footer={
            <><Button type="button" variant="secondary" disabled={saving||inventoryBlocked} onClick={()=>void requestFormClose(closeStock,stockDirty.current)}>{tr("Cancelar","Cancel")}</Button><Button form="pro-stock-form" type={inventoryBlocked?"button":"submit"} disabled={saving} onClick={inventoryBlocked?()=>{void inventoryRef.current?.retry().then(saved=>{if(saved)setInventoryDone("movement");});}:undefined}>
              {saving?tr("Guardando…","Saving…"):inventoryBlocked?tr("Comprobar guardado","Check saved result"):tr("Guardar","Save")}
            </Button></>
          }
        >
          <form
            id="pro-stock-form"
            onChange={()=>{stockDirty.current=true;}}
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if(inventoryBlocked)return;
              const f = new FormData(e.currentTarget);
              void apply(() =>
                moveStock(
                  data,
                  stock,
                  Number(f.get("quantity")) *
                    (f.get("kind") === "out" ? -1 : 1),
                  String(f.get("reason")),
                  crypto.randomUUID(),
                  new Date().toISOString(),
                ),
              );
            }}
          >
            {inventoryBlocked&&<p data-inventory-write-recovery role="status">{saving?tr("Guardando…","Saving…"):tr("Compruebe el guardado antes de continuar.","Check the saved result before continuing.")}</p>}
            <fieldset disabled={saving||inventoryBlocked} className="space-y-4">
            <label className="block font-bold">
              {tr("Tipo de movimiento", "Movement type")}
              <select
                aria-label={tr("Tipo de movimiento", "Movement type")}
                name="kind"
                defaultValue={(inventoryInput?.movements[0]?.delta??0)<0?"out":"in"}
                className={field}
              >
                <option value="in">{tr("Entrada", "Stock in")}</option>
                <option value="out">{tr("Salida", "Stock out")}</option>
              </select>
            </label>
            <label className="block font-bold">
              {tr("Cantidad", "Quantity")}
              <input
                name="quantity"
                defaultValue={inventoryInput?.movements[0]?Math.abs(inventoryInput.movements[0].delta):undefined}
                type="number"
                min="0.001"
                step="0.001"
                required
                className={field}
              />
            </label>
            <label className="block font-bold">
              {tr("Motivo del movimiento", "Movement reason")}
              <input name="reason" defaultValue={inventoryInput?.movements[0]?.reason} required maxLength={160} className={field} />
            </label>
            </fieldset>
          </form>
        </Modal>
      )}
      {catalog && section==="Clientes" && params.get("fiscalCliente") && <ClientFiscalSettings key={params.get("fiscalCliente")} clientId={params.get("fiscalCliente")!}/>}
    </div>
  );
}
