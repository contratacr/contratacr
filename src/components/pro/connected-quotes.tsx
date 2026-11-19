"use client";
import {ProRecordCard} from "./record-card";
import {ProSectionActions} from "./section-actions";
import {useRouter} from 'next/navigation';
import {projectOriginPath} from '@/lib/pro/project-origin';
import {QuoteChoices} from './quote-choices';
import {ServicePackageManager} from './service-packages';
import {InvoiceDraftAction} from './invoice-draft';
import {navigatePro,pushProParams,replaceProParams,closeProStep,backPro,proDashboardPath} from "@/lib/pro/navigation";
import { ProSearchField } from "./search-field";
import { proMoney } from "@/lib/pro/money";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {useProSearchParams} from "./use-pro-search-params";
import { ReceiptText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { CardActionsMenu } from "@/components/dashboard/card-actions-menu";
import { SectionHeadline } from "@/components/dashboard/section-headline";
import {
  PanelListSkeleton,
  PanelEmptyState,
} from "@/components/ui/content-loading";
import { QuoteEditorLoader } from "./quote-editor-loader";
import { QuoteDetailModal } from "@/components/quotes/quote-detail-modal";
import type { Business } from "@/lib/pro/business";
import type { Quote } from "@/lib/quotes";
import { ProWorkspace } from "./pro-workspace";
import {proQuoteStatus,type ProQuoteStatus} from "@/lib/pro/quote-status";
function manualLeadOrigin(value:unknown,leadId:string|null){const path=proDashboardPath(value);if(!path||!leadId)return null;const url=new URL(path,window.location.origin);return url.searchParams.get('tab')==='pro_leads'&&url.searchParams.get('solicitudManual')===leadId?path:null;}
export function ConnectedQuotes({
  proName,
  proSlug,
  puedeCrear = true,
}: {
  proName: string;
  proSlug?: string | null;
  puedeCrear?: boolean;
}) {
  const router=useRouter();
  const locale = useLocale(),
    en = locale === "en",
    params = useProSearchParams();
  const tr = (es: string, eng: string) => (en ? eng : es);
  const ux = useTranslations("ProQuoteUX"),journey=useTranslations("ProJourney");
  const [rows,setRows]=useState<import('@/lib/pro/panel-queries').ProQuoteRow[]>([]),[ready,setReady]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const editor=params.get("nueva")==="1",detail=editor?null:params.get("cotizacion"),legacyDetail=params.get("legacy")==="1";
  const [quote,setQuote]=useState<Quote|null>(null),[old,setOld]=useState<Business['quotes'][number]|null>(null),[link,setLink]=useState<{quoteId:string;clientId:string}|null>(null);
  const [owned,setOwned]=useState(false);
  const [choicesBlocked,setChoicesBlocked]=useState(false);
  const [resolvedDetail,setResolvedDetail]=useState("");
  const detailKey=`${legacyDetail?"legacy":"quote"}:${detail||""}`;
  const detailReady=resolvedDetail===detailKey;
  const [detailError,setDetailError]=useState(false),[detailRetry,setDetailRetry]=useState(0);
  const filter=["all","draft","sent","accepted","declined","withdrawn"].includes(params.get("estado")||"")?params.get("estado")!:"all",search=params.get("q")||"";
  const [cursor,setCursor]=useState<string|null>(null),[failedAfter,setFailedAfter]=useState("");
  const [errorFor,setErrorFor]=useState("");
  const sequence=useRef(0),busy=useRef(false),detailSequence=useRef(0),sentinel=useRef<HTMLDivElement>(null);
  const invalidate=useCallback(()=>{sequence.current++;busy.current=false;},[]);
  const query='/api/pro/quotes?'+new URLSearchParams({q:search,status:filter});
  const load=async(after='')=>{
    if(after&&busy.current)return;const request=++sequence.current;busy.current=true;setLoading(true);setError("");
    try{const response=await fetch(query+'&'+new URLSearchParams({after}),{cache:'no-store'}),body=await response.json();if(!response.ok)throw Error(body.error||response.statusText||String(response.status));if(request!==sequence.current)return;
    setRows(previous=>after?[...previous.filter(r=>!body.items.some((n:{key:string})=>n.key===r.key)),...body.items]:body.items);setCursor(body.nextCursor);setReady(true);
    }catch(e){if(request===sequence.current){setError((e as Error).message);setFailedAfter(after);}}finally{if(request===sequence.current){busy.current=false;setLoading(false);}}
  };
  const latestLoad=useRef(load);useEffect(()=>{latestLoad.current=load;});
  useEffect(()=>{const timer=setTimeout(()=>void latestLoad.current(),200);return()=>{clearTimeout(timer);invalidate();};},[query,invalidate]);
  useEffect(()=>{if(!detail)return;const request=++detailSequence.current;let alive=true;
    fetch('/api/pro/quotes?'+new URLSearchParams({id:detail,...(legacyDetail?{legacy:'1'}:{})}),{cache:'no-store'}).then(async r=>{const body=await r.json();if(!r.ok)throw Error();if(!alive||request!==detailSequence.current)return;if(!body.quote&&!body.document?.quotes[0])throw Error();setQuote(body.quote||null);setOwned(body.owned===true);setOld(body.document?.quotes[0]||null);setLink(body.link||null);setResolvedDetail(`${legacyDetail?"legacy":"quote"}:${detail}`);}).catch(()=>{if(alive&&request===detailSequence.current){setDetailError(true);setErrorFor(`${legacyDetail?"legacy":"quote"}:${detail}`);}});return()=>{alive=false;};
  },[detail,legacyDetail,detailRetry]);
  useEffect(()=>{const node=sentinel.current;if(!node||loading||error||!cursor)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))void latestLoad.current(cursor);},{rootMargin:'160px'});observer.observe(node);return()=>observer.disconnect();},[cursor,loading,error,rows]);
  function openDetail(id:string,legacy=false){pushProParams({cotizacion:id,legacy:legacy?"1":null,nueva:null});}
  function closeDetail(){
    if(choicesBlocked)return;
    const manualOrigin=manualLeadOrigin(params.get('volverSolicitudManual'),params.get('solicitudManualOrigen'));if(manualOrigin&&backPro(manualOrigin))return;
    const projectOrigin=projectOriginPath(params.get("volverProyecto"));if(projectOrigin&&params.get("proyectoOrigen")){router.push(projectOrigin);return;}
    detailSequence.current++;setDetailError(false);setQuote(null);setOld(null);setLink(null);
    // A WebView reload may discard custom history state. Retain the exact
    // customer/job origin as a validated same-dashboard fallback in the URL.
    const requestOrigin=proDashboardPath(params.get("volverSolicitud"));
    const requestUrl=requestOrigin?new URL(requestOrigin,window.location.origin):null;
    if(requestOrigin&&requestUrl?.searchParams.get('tab')==='pro_agenda'&&requestUrl.searchParams.get('citaSolicitud')===params.get('solicitudOrigen')&&backPro(requestOrigin))return;
    const target=proDashboardPath(params.get("volverCliente"));
    const origin=target?new URL(target,window.location.origin):null;
    if(target&&origin?.searchParams.get("tab")==="pro_clients"&&origin.searchParams.get("cliente")&&backPro(target))return;
    closeProStep("cotizacion","legacy");
  }
  const status=(s:string)=>['accepted','declined','sent','draft','withdrawn'].includes(s)?proQuoteStatus(s as ProQuoteStatus,en):s;
  const requestOrigin=typeof window==='undefined'?null:proDashboardPath(params.get('volverSolicitud'));
  const requestUrl=requestOrigin?new URL(requestOrigin,window.location.origin):null;
  const fromRequest=!!requestOrigin&&requestUrl?.searchParams.get('tab')==='pro_agenda'&&requestUrl.searchParams.get('citaSolicitud')===params.get('solicitudOrigen');
  const manualOrigin=typeof window==='undefined'?null:manualLeadOrigin(params.get('volverSolicitudManual'),params.get('solicitudManualOrigen'));
  const manualRevision=Number(params.get('revisionSolicitudManual')),validManualRevision=Number.isInteger(manualRevision)&&manualRevision>0?manualRevision:undefined;
  const projectCopy=useTranslations("ProProjectJourney");
  const schedule=(clientId:string,id:string,legacy=false)=>navigatePro("pro_agenda",{nueva:"1",cliente:clientId,[legacy?"anterior":"cotizacion"]:id});
  const money = proMoney;
  const filtered=!!search.trim()||filter!=="all";
  function resetFilters(){invalidate();setRows([]);setCursor(null);setLoading(true);replaceProParams({q:null,estado:null});}

  return (
    <div className="space-y-4">
      <SectionHeadline>
        <div className="w-full">
        <Button
          size="crear"
          className="w-full"
          onClick={() => pushProParams({nueva:"1",cotizacion:null,legacy:null})}
          disabled={!ready || !puedeCrear}
        >
          <Plus className="h-4 w-4" />
          {tr("Nueva cotización", "New quote")}
        </Button>
        <ProSectionActions><CardActionsMenu label={tr('Opciones de cotizaciones','Quote options')} placement="down" triggerClassName="h-11 w-11 border-0 hover:border-transparent" actions={[{label:tr('Servicios frecuentes','Frequent services'),onClick:()=>pushProParams({plantillaServicios:'1'})}]}/></ProSectionActions>
        </div>
      </SectionHeadline>
      {error && (
        <p role="alert">
          {error}
          <Button variant="secondary" disabled={loading} onClick={() => void load(failedAfter)}>
            {tr("Reintentar", "Retry")}
          </Button>
        </p>
      )}
      {!ready && !error ? (
        <PanelListSkeleton rows={3} compacto />
      ) : (
        <>
          <div className="space-y-3">
          <label className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#52627a]">
            <span>{ux("status")}</span>
            <select aria-label={ux("statusLabel")} value={filter} onChange={e=>{if(e.target.value===filter)return;invalidate();replaceProParams({estado:e.target.value==="all"?null:e.target.value});setRows([]);setCursor(null);setLoading(true);}} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#e5e7eb] bg-white px-3 text-[15px] text-[#162543]">
              {["all","draft","sent","accepted","declined","withdrawn"].map(id=><option key={id} value={id}>{id==="all"?tr("Todas","All"):status(id)}</option>)}
            </select>
          </label>
          <ProSearchField label={tr("Buscar cotizaciones","Search quotes")} placeholder={tr("Buscar cliente o cotización","Search customer or quote")} value={search} onChange={value=>{invalidate();replaceProParams({q:value});setRows([]);setCursor(null);setLoading(true);}}/>
          </div>
          {filtered&&<Button variant="ghost" onClick={resetFilters}>{ux("reset")}</Button>}
          {loading&&!rows.length?<PanelListSkeleton rows={3} compacto/>:!rows.length ? (
            <PanelEmptyState
              icon={ReceiptText}
              title={ux(filtered?"noMatches":"empty")}
              description={ux(filtered?"noMatchesHint":"emptyHint")}
            />
          ) : (
            rows.map((q) => (
              <ProRecordCard key={q.key} icon={ReceiptText}
                title={q.title || q.client} subtitle={q.client || undefined}
                meta={status(q.status)} amount={money(q.total)}
                onOpen={() => openDetail(q.id,q.legacy)}
                openLabel={tr("Ver cotización","View quote")}
              />
            ))
          )}
          {cursor && !error && (
            <div ref={sentinel}>
              <Button
                variant="secondary"
                disabled={loading}
                onClick={() => void load(cursor)}
              >
                {tr("Ver más", "Show more")}
              </Button>
            </div>
          )}
        </>
      )}
      {editor && (
        <QuoteEditorLoader
          open
          initialProClientId={params.get("cliente") || undefined}
          sourceRequestId={params.get("solicitudOrigen") || undefined}
          sourceProjectId={params.get("proyectoOrigen") || undefined}
          sourceManualLeadId={params.get("solicitudManualOrigen") || undefined}
          sourceManualLeadRevision={validManualRevision}
          onClose={() => {
            if(manualOrigin&&backPro(manualOrigin))return;
            const projectOrigin=projectOriginPath(params.get("volverProyecto"));if(projectOrigin&&params.get("proyectoOrigen")){router.push(projectOrigin);return;}
            const origin=proDashboardPath(params.get('volverSolicitud')),url=origin?new URL(origin,window.location.origin):null;
            if(origin&&url?.searchParams.get('tab')==='pro_agenda'&&url.searchParams.get('citaSolicitud')===params.get('solicitudOrigen')&&backPro(origin))return;
            closeProStep('nueva','cliente','solicitudOrigen','volverSolicitud','proyectoOrigen','volverProyecto','solicitudManualOrigen','revisionSolicitudManual','volverSolicitudManual');
          }}
          onSent={(q) => {
            replaceProParams({nueva:null,cliente:null,cotizacion:q.id,legacy:null});
            void load();
          }}
        />
      )}
      {detail&&(!detailReady||!quote&&!old)&&(
        <Modal title={ux("detail")} closeLabel={tr("Cerrar","Close")} onClose={closeDetail} mobilePresentation="sheet-compact">
          {detailError&&errorFor===detailKey?<div className="space-y-4"><p role="alert">{ux("detailError")}</p><Button variant="secondary" onClick={()=>{setDetailError(false);setDetailRetry(v=>v+1);}}>{tr("Reintentar","Retry")}</Button></div>:<p role="status">{ux("detailLoading")}</p>}
        </Modal>
      )}
      {detail&&detailReady&&quote && (
        <QuoteDetailModal
          open
          quote={quote}
          role="pro"
          proName={proName}
          proSlug={proSlug}
          onClose={closeDetail}
          onChanged={() => {
            closeDetail();
            void load();
          }}
          proActions={<div className="flex flex-wrap gap-2">
            {owned&&<QuoteChoices quoteId={quote.id} onStateChange={state=>setChoicesBlocked(state.dirty||state.busy)} onChanged={()=>{setDetailRetry(v=>v+1);void load();}}/>}
            {owned&&<InvoiceDraftAction kind="quote" sourceId={quote.id} disabled={quote.status==='withdrawn'||quote.status==='declined'}/>}
            {projectOriginPath(params.get("volverProyecto"))&&params.get("proyectoOrigen")&&<Button disabled={choicesBlocked} onClick={()=>router.push(projectOriginPath(params.get("volverProyecto"))!)}>{projectCopy("backProject")}</Button>}
            {manualOrigin&&<Button disabled={choicesBlocked} onClick={()=>backPro(manualOrigin)}>{tr('Volver a la solicitud','Back to lead')}</Button>}
            {fromRequest&&<Button disabled={choicesBlocked} onClick={()=>backPro(requestOrigin!)}>{journey('backRequest')}</Button>}
            {!fromRequest&&!manualOrigin&&link&&quote.status==='accepted'&&<Button onClick={()=>schedule(link.clientId,quote.id)}>{tr('Agendar cita','Schedule appointment')}</Button>}
          </div>}
        />
      )}
      {detail&&detailReady&&old && (
        <Modal
          title={old.title}
          closeLabel={tr("Cerrar", "Close")}
          onClose={() => {
            closeDetail();
            void load();
          }}
          mobilePresentation="fullscreen"
          footer={<div className="flex flex-wrap gap-2">
            <InvoiceDraftAction kind="legacy_quote" sourceId={old.id} disabled={old.status==='declined'}/>
            {old.status==='accepted'&&<Button onClick={()=>schedule(old.clientId,old.id,true)}>{tr('Agendar cita','Schedule appointment')}</Button>}
          </div>}
        >
          <ProWorkspace
            server
            embedded
            section="Cotizaciones"
            quoteListOnly
            onlyQuoteId={old.id}
            english={en}
          />
        </Modal>
      )}
      <ServicePackageManager/>
    </div>
  );
}
