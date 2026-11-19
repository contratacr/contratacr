"use client";
import type {DirectProjectQuoteInput} from "@/lib/pro/direct-project-quotes";
import {ProModal} from "@/components/pro/modal";

import {registerProTraversalGuard} from '@/components/pro/use-pro-search-params';
import {currentProPath,PRO_PATH_CHANGED,PRO_BEFORE_PATH_CHANGE} from '@/lib/pro/navigation';
import {quoteValidUntil} from "@/lib/quote-validity";
import {parseQuotePriceInput} from "@/lib/pro/quote-price-input";
import {ServicePackagePicker} from "@/components/pro/service-packages";
import {packageQuoteRows} from "@/lib/pro/service-packages";
import { CatalogSelect } from "@/components/pro/catalog-select";
import type {Client,Product} from "@/lib/pro/business";
import type {Business} from "@/lib/pro/business";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ListChecks, Loader2, Plus, Trash2, User } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { CedulaInput } from "@/components/ui/cedula-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { EtiquetaObligatoria, EtiquetaOpcional } from "@/components/ui/etiqueta-campo";
import { cleanId, isValidId } from "@/lib/cedula";
import { Totales } from "@/components/quotes/quote-detail-modal";
import { quoteTotals, QUOTE_MAX_ITEMS, type Quote, type QuoteItem, type QuoteTaxMode } from "@/lib/quotes";
import { formatColones } from "@/lib/pricing";
import { borrarBorrador, guardarBorrador, rutaParaEntrar } from "@/lib/borrador-sin-sesion";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";

/**
 * Nueva cotización: lo mismo que piden Jobber o Square — cliente, líneas,
 * total, vigencia y nota — en DOS tarjetas: el cliente y el trabajo (con sus
 * condiciones). Antes «Condiciones» era una tercera tarjeta para tres datos. La cédula trae el nombre del padrón (como en el registro),
 * el teléfono lleva su código de país, y el IVA es una sola fila de tres
 * opciones cortas en vez de tres tarjetas.
 */
const DATE_LOCALE: Record<string, string> = { es: "es-CR", en: "en-US" };

type Row = { id: number; description: string; quantity: string; unit_price: string };
let seq = 1;
const nuevaFila = (): Row => ({ id: seq++, description: "", quantity: "1", unit_price: "" });

/** Lo que se guarda al «enviar» sin sesión (ver borrador-sin-sesion.ts). */
export type BorradorDeCotizacion = {
  cedula: string; clientName: string; clientPhone: string; clientEmail: string; title: string;
  rows: { description: string; quantity: string; unit_price: string }[];
  taxMode: QuoteTaxMode; notes: string; validDays: number;
};

export function QuoteEditorModal({ open, onClose, projectId, defaultTitle, clientName: clienteConocido, onSent, sinSesion = false, inicial = null, proData, initialProClientId, proRemote=false, restoredQuote=null, onProDraftChange, proNotice, sourceRequestId, sourceManualLeadId, sourceManualLeadRevision, initialClientActionId, initialRequestPending=false, onProCreate, proCreationPending=false }: {
  onProCreate?:(input:DirectProjectQuoteInput)=>Promise<Quote|null>;
  proCreationPending?:boolean;
  sourceRequestId?:string;
  sourceManualLeadId?:string;
  sourceManualLeadRevision?:number;
  initialClientActionId?:string;
  initialRequestPending?:boolean;
  proNotice?:ReactNode;
  restoredQuote?:Quote|null;
  onProDraftChange?:(draft:BorradorDeCotizacion & {proClientId:string;createdQuoteId?:string;clientActionId?:string;requestPending?:boolean})=>boolean|void;
  initialProClientId?:string;
  proData?: Business | null;
  proRemote?:boolean;
  open: boolean; onClose: () => void; projectId?: string | null; defaultTitle?: string;
  /** Sin cuenta: al enviar se guarda el borrador y se pide entrar o registrarse. */
  sinSesion?: boolean;
  /** Borrador escrito antes de entrar: el editor se abre lleno. */
  inicial?: BorradorDeCotizacion | null;
  /** Desde una cita o un proyecto el cliente ya se sabe: se muestra, no se pregunta. */
  clientName?: string | null;
  onSent: (quote: Quote) => void;
}) {
  const t = useTranslations("quotes");
  const locale = useLocale();
  const qc = useTranslations("ProQuoteModalCopy");
  const forms=useTranslations("ProForms"),proForm=proRemote||!!proData;
  const suelta = !projectId&&!sourceRequestId;
  const [clientActionId,setClientActionId]=useState(initialClientActionId??crypto.randomUUID());
  const [requestPending,setRequestPending]=useState(initialRequestPending);
  const initialCustomer=proData?.clients.find(c=>c.id===initialProClientId&&!c.archived);
 const [proClientId,setProClientId]=useState(initialProClientId||initialCustomer?.id||'');
 const [archivedCustomer,setArchivedCustomer]=useState(!!proData?.clients.find(c=>c.id===initialProClientId)?.archived);
 const submitLock=useRef(false),deliveryComplete=useRef(false);
 const [createdQuote,setCreatedQuote]=useState<Quote|null>(restoredQuote);
 const [cedula, setCedula] = useState(inicial?.cedula ?? initialCustomer?.identification ?? "");
  // "buscando" / "sin registro" se deducen de la cédula y del resultado, en vez
  // de escribirse desde el efecto (que dispara pintadas encadenadas).
  const [resultadoCedula, setResultadoCedula] = useState<{ id: string; encontrada: boolean } | null>(null);
  const cedulaLimpia = cleanId(cedula);
  const cedulaValida = isValidId(cedulaLimpia);
  const savedIdentification=!!initialCustomer?.identification&&cleanId(initialCustomer.identification)===cedulaLimpia;
  const [knownIdentification,setKnownIdentification]=useState(initialCustomer?.identification||'');
  const skipLookup=(proRemote||!!proData)&&(savedIdentification||cleanId(knownIdentification)===cedulaLimpia);
  const buscandoCedula = cedulaValida && !skipLookup && resultadoCedula?.id !== cedulaLimpia;
  const cedulaSinRegistro = resultadoCedula?.id === cedulaLimpia && !resultadoCedula.encontrada;
  const [clientName, setClientName] = useState(inicial?.clientName ?? initialCustomer?.name ?? "");
  const [clientPhone, setClientPhone] = useState(inicial?.clientPhone ?? initialCustomer?.phone ?? "");
  const [clientEmail, setClientEmail] = useState(inicial?.clientEmail ?? initialCustomer?.email ?? "");
  const [title, setTitle] = useState(inicial?.title ?? defaultTitle ?? "");
  const [rows, setRows] = useState<Row[]>(() => (inicial?.rows?.length ? inicial.rows.map((r) => ({ ...nuevaFila(), ...r })) : [nuevaFila()]));
  const [catalogPriceNotice,setCatalogPriceNotice]=useState(false);
  const [taxMode, setTaxMode] = useState<QuoteTaxMode>(inicial?.taxMode ?? "incluido");
  const [notes, setNotes] = useState(inicial?.notes ?? "");
  const [validDays, setValidDays] = useState(inicial?.validDays ?? 15);
  // La vigencia se dice como fecha, que es lo que el cliente va a leer.
  const [openedAt] = useState(() => Date.now());
  const validaHasta = new Date(quoteValidUntil(validDays,openedAt)+"T12:00:00-06:00").toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { timeZone:"America/Costa_Rica", day: "numeric", month: "short" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasProCreate=!!onProCreate;
  const requestBlocked=(!!sourceRequestId&&(sending||requestPending))||(!!onProCreate&&(sending||proCreationPending));
  const warnRequest=()=>setError(qc("checkBeforeLeaving"));
  useEffect(()=>{
    if(!requestBlocked)return;
    const path=currentProPath(),state={...window.history.state};
    const back=(event:PopStateEvent)=>{if(deliveryComplete.current)return false;event.stopImmediatePropagation();window.history.pushState(state,'',path);window.dispatchEvent(new Event(PRO_PATH_CHANGED));return true;};
    const unload=(event:BeforeUnloadEvent)=>{if(!deliveryComplete.current){event.preventDefault();event.returnValue='';}};
    const before=(event:Event)=>{if(!deliveryComplete.current)event.preventDefault();};
    const unregister=registerProTraversalGuard(back);window.addEventListener('beforeunload',unload);window.addEventListener(PRO_BEFORE_PATH_CHANGE,before);
    return()=>{unregister();window.removeEventListener('beforeunload',unload);window.removeEventListener(PRO_BEFORE_PATH_CHANGE,before);};
  },[requestBlocked]);
  function closeEditor(){if(requestBlocked){warnRequest();return;}onClose();}


  function chooseCustomer(c:Client|undefined){setProClientId(c?.id||'');setArchivedCustomer(!!c?.archived);setKnownIdentification(c?.identification||'');setCedula(c?.identification||'');setClientName(c?.name.slice(0,80)||'');setClientEmail(c?.email||'');setClientPhone(c?.phone||'');}
  function chooseProduct(p:Product|undefined){if(p){setCatalogPriceNotice(!Number.isInteger(p.price*(taxMode==='incluido'?1.13:1)));setRows(previous=>{const row={...nuevaFila(),description:p.name.slice(0,140),quantity:'1',unit_price:String(Math.round(p.price*(taxMode==='incluido'?1.13:1)))};return previous.length===1&&!previous[0].description&&!previous[0].unit_price?[row]:[...previous,row];});}}
  // La cédula trae el nombre oficial, igual que en el registro. Es opcional:
  // quien no la sepa escribe el nombre a mano y listo.
  useEffect(() => {
    const limpia = cleanId(cedula);
    if (!isValidId(limpia)||skipLookup||sourceRequestId||sourceManualLeadId||hasProCreate&&(sending||proCreationPending)) return;
    let vivo = true;
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/cedula/${limpia}`);
        if (!vivo) return;
        if (res.ok) {
          const { fullName } = await res.json();
          if (!vivo) return;
          if (fullName) setClientName(String(fullName).slice(0, 80));
          setResultadoCedula({ id: limpia, encontrada: !!fullName });
        } else setResultadoCedula({ id: limpia, encontrada: false });
      } catch { if (vivo) setResultadoCedula({ id: limpia, encontrada: false }); }
    }, 500);
    return () => { vivo = false; window.clearTimeout(id); };
  }, [cedula,skipLookup,sourceRequestId,sourceManualLeadId,hasProCreate,sending,proCreationPending]);

  useEffect(()=>{if(!onProDraftChange)return;onProDraftChange({cedula,clientName,clientPhone,clientEmail,title,rows:rows.map(({description,quantity,unit_price})=>({description,quantity,unit_price})),taxMode,notes,validDays,proClientId,...(sourceRequestId?{clientActionId,requestPending}:{}),...(createdQuote?{createdQuoteId:createdQuote.id}:{})});},[cedula,clientName,clientPhone,clientEmail,title,rows,taxMode,notes,validDays,proClientId,createdQuote,onProDraftChange,sourceRequestId,clientActionId,requestPending]);

  const items: QuoteItem[] = rows
    .map((r) => ({ description: r.description.trim(), quantity: Number(r.quantity), unit_price: proForm ? (parseQuotePriceInput(r.unit_price) ?? NaN) : Math.round(Number(r.unit_price.replace(/[^\d]/g, ""))) }))
    .filter((it) => it.description && it.quantity > 0 && Number.isFinite(it.unit_price) && it.unit_price >= 0);
  const totals = quoteTotals(items, taxMode);
  const setRow = (id: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const ModalComponent=proForm?ProModal:Modal;
  const recoveringDirect=!!onProCreate&&proCreationPending;
  const listo = recoveringDirect || (proForm ? rows.some(r=>r.description.trim()&&Number(r.quantity)>0&&r.unit_price!=="") : items.length > 0) && (!suelta || clientName.trim().length > 0);

  async function enviar() {
    if(submitLock.current)return;
    if(archivedCustomer&&!requestPending&&!proCreationPending&&!createdQuote){setError(t("proArchivedCustomer"));return;}
    if (!recoveringDirect && suelta && !clientName.trim()) { setError(t("errorNeedsClient")); return; }
    if(!recoveringDirect&&proForm&&rows.some(r=>(r.description.trim()||r.unit_price.trim()||r.quantity!=="1")&&(!r.description.trim()||!Number.isFinite(Number(r.quantity))||Number(r.quantity)<=0))){setError(forms("incompleteLine"));return;}
    if(!recoveringDirect&&proForm&&rows.some(r=>r.unit_price!==""&&parseQuotePriceInput(r.unit_price)===null)){setError(t("proWholePriceError"));return;}
    if (!recoveringDirect && items.length === 0) { setError(t("errorNeedsItems")); return; }
    // Una línea sin precio se enviaba en ₡0 sin decir nada: el cliente recibía
    // una cotización que no cotiza. No se bloquea el ítem gratis a propósito
    // —eso se escribe con un 0— sino el campo VACÍO, que es un descuido.
    if (!recoveringDirect && rows.some((r) => r.description.trim() && String(r.unit_price).trim() === "")) {
      setError(t("errorNeedsPrices"));
      return;
    }
    // Sin cuenta: se guarda todo y se pide entrar. Al volver, el editor se
    // abre lleno en Cotizaciones y solo falta tocar «Enviar».
    if (sinSesion) {
      submitLock.current=true;setSending(true);
      await guardarBorrador<BorradorDeCotizacion>("cotizacion", {
        cedula, clientName, clientPhone, clientEmail, title, taxMode, notes, validDays,
        rows: rows.map(({ description, quantity, unit_price }) => ({ description, quantity, unit_price })),
      });
      window.location.assign(rutaParaEntrar(prefijoDeIdioma(locale), "/cotizar"));
      return;
    }
    submitLock.current=true;setSending(true); setError(null);
    try {
      let quote=createdQuote;
      let atomicCreated=false;
      if(!quote&&onProCreate&&!sourceRequestId){
        quote=await onProCreate({context:projectId?'project':'direct',clientActionId,proClientId:proClientId||null,...(projectId?{projectId}:{}),...(sourceManualLeadId?{sourceManualLeadId,sourceManualLeadRevision}:{}),clientName:clientName||null,clientPhone:clientPhone||null,clientEmail:clientEmail||null,clientCedula:cleanId(cedula)||null,title:title||null,items,taxMode,notes:notes||null,validDays});
        if(!quote){setClientActionId(crypto.randomUUID());setError(t("errorTitle"));return;}
        atomicCreated=true;setCreatedQuote(quote);
      }
      if(!quote){
      if(sourceRequestId){
        const stored=onProDraftChange?.({cedula,clientName,clientPhone,clientEmail,title,rows:rows.map(({description,quantity,unit_price})=>({description,quantity,unit_price})),taxMode,notes,validDays,proClientId,clientActionId,requestPending:true});
        if(stored===false){setError(qc("draftNotSaved"));return;}
        setRequestPending(true);
      }
      const res = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, ...(sourceRequestId?{sourceRequestId,clientActionId}:{}), ...(proRemote&&projectId?{proProjectContext:true}:{}), clientName, clientPhone, clientEmail, clientCedula: cleanId(cedula), title, items, taxMode, notes, validDays }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { if(sourceRequestId&&!requestPending&&[400,404,409,422].includes(res.status)){setRequestPending(false);setClientActionId(crypto.randomUUID());} setError(res.status === 503 ? t("errorUnavailable") : sourceRequestId ? t("errorTitle") : d.error ?? t("errorTitle")); return; }
      if(!d.quote?.id)throw Error();
      quote=d.quote as Quote;setCreatedQuote(quote);setRequestPending(false);
      onProDraftChange?.({cedula,clientName,clientPhone,clientEmail,title,rows:rows.map(({description,quantity,unit_price})=>({description,quantity,unit_price})),taxMode,notes,validDays,proClientId,createdQuoteId:quote.id,...(sourceRequestId?{clientActionId,requestPending:false}:{})});
      }
      if(proClientId&&!sourceRequestId&&!atomicCreated){
       const linked=await fetch("/api/pro/quote-link",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quoteId:quote.id,clientId:proClientId})});
       if(!linked.ok){setError(t("proLinkRetry"));return;}
      }
      borrarBorrador("cotizacion");
      deliveryComplete.current=true;onSent(quote);
      setRows([nuevaFila()]); setNotes(""); setTitle(defaultTitle ?? ""); setClientName(""); setClientPhone(""); setClientEmail(""); setCedula("");
    } catch { setError(t("errorTitle")); } finally { submitLock.current=false;setSending(false); }
  }

  const campo = "w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[15px] text-[#162543] placeholder:text-[#8f9aaa] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]";
  const rotulo = "mb-2 block text-[13px] font-bold text-[#162543]";
  const pastilla = (activa: boolean) => `h-10 shrink-0 rounded-full border px-4 text-[13px] font-bold transition-colors ${activa ? "border-[#009FD9] bg-[#eaf7fc] text-[#0089bb]" : "border-[#d7e1ea] bg-white text-[#52627a] hover:bg-[#f6f9fb]"}`;
  // `shadow-sm`: la MISMA tarjeta que publicar empleo y publicar promoción. Sin
  // ella, las tarjetas de esta ventana eran las únicas planas del app y la
  // ventana parecía de otro producto.
  const bloque = "rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-5";
  const tituloBloque = "mb-3 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#8a94a6]";

  return (
    <ModalComponent open={open} onClose={closeEditor} title={t("editorTitle")} ariaLabel={proForm?t("editorTitle"):undefined} size="lg" mobilePresentation="fullscreen" closeLabel={t("close")}
      footerNotice={error ? <p role={proForm?"alert":undefined} className="text-sm font-semibold text-red-600">{error}</p> : undefined}
      footerClassName="px-4 sm:flex sm:justify-end sm:gap-3 sm:px-6"
      footer={(
        <>
          {/* La salida acompaña a la acción en computadora; en el teléfono basta
              la equis de arriba y el botón se queda con todo el ancho. */}
          <Button type="button" variant="outline" size="lg" onClick={closeEditor} disabled={requestBlocked} className="hidden sm:inline-flex sm:px-6">
            {t("cancel")}
          </Button>
          <Button type="button" size="lg" className="w-full sm:w-auto sm:px-8" onClick={() => void enviar()} disabled={sending || !listo} loading={sending}>
            {sending ? (suelta ? t("creating") : t("sending")) : (sourceRequestId&&requestPending||proCreationPending) ? qc("checkSavedResult") : (suelta ? t("create") : t("send"))}
          </Button>
        </>
      )}>
      {proNotice}
      {(sourceRequestId&&requestPending||proCreationPending)&&!sending&&<p role="status" className="text-sm text-[#52627a]">{qc("checkPreviousAttempt")}</p>}
      {archivedCustomer&&<p role="alert" className="text-sm text-red-700">{t("proArchivedCustomer")}</p>}
      <fieldset disabled={!!createdQuote||requestPending||proCreationPending||sending} className="flex min-w-0 flex-col gap-3.5 sm:gap-4">
        {/* 1 · Para quién. Desde una cita o un proyecto el cliente ya se sabe:
            se muestra en vez de preguntarse, y la caja no cambia de sitio. */}
        {(!suelta||sourceManualLeadId) && clienteConocido && (
          <section className={bloque}>
            <p className={tituloBloque}><User className="h-3.5 w-3.5" />{t("forWhomLabel")}</p>
            <p className="text-[15px] font-bold text-[#162543]">{clienteConocido}</p>
          </section>
        )}
        {suelta && !sourceManualLeadId && (
          <section className={bloque}>
            <p className={tituloBloque}><User className="h-3.5 w-3.5" />{t("forWhomLabel")}</p>
            {proRemote?<CatalogSelect kind="clients" label={t("proSavedCustomer")} value={proClientId} disabled={!!createdQuote} selected={initialCustomer?.id===proClientId?initialCustomer:undefined} onChange={chooseCustomer}/>:proData&&<label className="mb-3 block"><span className={rotulo}>{t("proSavedCustomer")}</span><select aria-label={t("proSavedCustomer")} className={campo} value={proClientId} disabled={!!createdQuote} onChange={e=>chooseCustomer(proData.clients.find(c=>c.id===e.target.value))}><option value="">{t("proChooseCustomer")}</option>{proData.clients.filter(c=>!c.archived).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
            {proForm?<div className="space-y-3">
              <label className="block"><span className={rotulo}><EtiquetaObligatoria>{t("clientNameLabel")}</EtiquetaObligatoria></span><input aria-required value={clientName} onChange={event=>setClientName(event.target.value.slice(0,80))} placeholder={t("clientNamePlaceholder")} className={campo}/></label>
              <details className="rounded-xl border border-[#e5e7eb] p-3"><summary className="cursor-pointer text-sm font-semibold text-[#52627a]">{forms("quoteContact")}</summary><div className="mt-3 space-y-3">
                <p className="text-xs text-[#68778d]">{t("clientCedulaLookupNotice")}</p>
                <CedulaInput value={cedula} onChange={setCedula} labelText={t("clientCedulaLabel")}/>
                {buscandoCedula&&<p role="status" className="text-xs text-[#0089bb]">{t("clientCedulaSearching")}</p>}
                {cedulaSinRegistro&&<p className="text-xs text-[#68778d]">{t("clientCedulaNotFound")}</p>}
                <PhoneInput className={proForm?"[&>div]:h-[46px]":undefined} language={proForm?locale:undefined} value={clientPhone} onChange={setClientPhone} label={t("clientPhoneLabel")} optional/>
                <label className="block"><span className={rotulo}><EtiquetaOpcional>{t("clientEmailLabel")}</EtiquetaOpcional></span><input type="email" inputMode="email" value={clientEmail} onChange={event=>setClientEmail(event.target.value.slice(0,120))} placeholder={t("clientEmailPlaceholder")} className={campo}/></label>
                <p className="text-xs text-[#68778d]">{t("clientContactHint")}</p>
              </div></details>
            </div>:<>
            <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-x-4">
              <div className="sm:col-span-2">
                <p className="mb-2 text-xs leading-5 text-[#52627a]">{t("clientCedulaLookupNotice")}</p>
                <CedulaInput value={cedula} onChange={setCedula} labelText={t("clientCedulaLabel")} />
                {buscandoCedula && <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0089bb]"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("clientCedulaSearching")}</p>}
                {cedulaSinRegistro && <p className="mt-1.5 text-[12px] text-[#68778d]">{t("clientCedulaNotFound")}</p>}
              </div>
              <label className="block sm:col-span-2">
                <span className={rotulo}><EtiquetaObligatoria>{t("clientNameLabel")}</EtiquetaObligatoria></span>
                <input aria-required value={clientName} onChange={(e) => {setClientName(e.target.value.slice(0, 80));}} placeholder={t("clientNamePlaceholder")} className={campo} />
              </label>
              <PhoneInput className={proForm?"[&>div]:h-[46px]":undefined} language={proForm?locale:undefined} value={clientPhone} onChange={setClientPhone} label={t("clientPhoneLabel")} optional />
              <label className="block">
                <span className={rotulo}><EtiquetaOpcional>{t("clientEmailLabel")}</EtiquetaOpcional></span>
                <input type="email" inputMode="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value.slice(0, 120))} placeholder={t("clientEmailPlaceholder")} className={campo} />
              </label>
              <p className="-mt-1 text-[12px] leading-snug text-[#68778d] sm:col-span-2 sm:mt-0">{t("clientContactHint")}</p>
            </div>
            </>}
          </section>
        )}

        {/* 2 · Qué incluye. Cada línea muestra su propio total: es lo que hace
            que una cotización se lea como un documento y no como un formulario. */}
        <section className={bloque}>
          <p className={tituloBloque}><ListChecks className="h-3.5 w-3.5" />{t("sectionWork")}</p>
          <label className="block">
            <span className={rotulo}><EtiquetaOpcional>{t("titleLabel")}</EtiquetaOpcional></span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t("titlePlaceholder")} className={campo} />
          </label>

          <div className="mt-4">
            {proRemote?<CatalogSelect kind="products" label={t("proAddInventory")} value="" disabled={rows.length>=QUOTE_MAX_ITEMS} onChange={chooseProduct}/>:proData&&<label className="mb-3 block"><span className={rotulo}>{t("proAddInventory")}</span><select aria-label={t("proAddInventory")} className={campo} value="" disabled={rows.length>=QUOTE_MAX_ITEMS} onChange={e=>{const p=proData.products.find(p=>p.id===e.target.value);if(p){setRows(previous=>{const row={...nuevaFila(),description:p.name.slice(0,140),quantity:'1',unit_price:String(Math.round(p.price*(taxMode==='incluido'?1.13:1)))};return previous.length===1&&!previous[0].description&&!previous[0].unit_price?[row]:[...previous,row];});}}}><option value="">{t("proChooseProduct")}</option>{proData.products.filter(p=>!p.archived).map(p=><option key={p.id} value={p.id}>{p.name}{p.itemType==='service'?t('proServiceSuffix'):''}</option>)}</select></label>}
            {proForm&&<p className="mb-3 text-xs text-[#68778d]">{t("proWholePriceHint")}</p>}
            {catalogPriceNotice&&<p role="status" className="mb-3 text-sm text-[#68778d]">{t("proCatalogPriceRounded")}</p>}
            {proRemote&&<ServicePackagePicker disabled={sending||!!createdQuote||proCreationPending} priceLabel={t('proPackagePreviewPrice')} previewPrice={line=>formatColones(Number(packageQuoteRows([line],taxMode)[0].unit_price))} note={t(taxMode==='incluido'?'proPackageIncluded':'proPackageBase')} onApply={lines=>{if(sending||createdQuote||proCreationPending)return false;const blank=rows.length===1&&!rows[0].description.trim()&&!rows[0].unit_price.trim()&&rows[0].quantity==='1';if((blank?0:rows.length)+lines.length>QUOTE_MAX_ITEMS){setError(t('proPackageLimit'));return false;}const added=packageQuoteRows(lines,taxMode).map(line=>({...nuevaFila(),...line}));setRows(previous=>blank?added:[...previous,...added]);setError(null);return true;}}/>}
            <span className={rotulo}><EtiquetaObligatoria>{t("itemsLabel")}</EtiquetaObligatoria></span>
            <div className="flex flex-col gap-2.5">
              {rows.map((r, indice) => {
                const cantidad = Number(String(r.quantity).replace(",", ".")) || 0;
                const precio = proForm ? (parseQuotePriceInput(r.unit_price) ?? 0) : Number(String(r.unit_price).replace(/[^\d]/g, "")) || 0;
                const totalLinea = Math.round(cantidad * precio);
                return (
                  <div key={r.id} className="rounded-2xl border border-[#e5e7eb] bg-white p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9aa8ba]">{t("itemNumber", { n: indice + 1 })}</span>
                      <button
                        type="button"
                        aria-label={t("removeItem")}
                        disabled={rows.length === 1}
                        onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                        className="grid h-8 w-8 place-items-center rounded-full text-[#8f9aaa] transition-colors hover:bg-[#fef2f2] hover:text-red-600 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <input value={r.description} onChange={(e) => setRow(r.id, { description: e.target.value })} maxLength={140} placeholder={t("itemDescription")} className={campo} />
                    {/* Rótulos a la vista en vez de dentro del campo: «Precio (₡)»
                        no cabía como marcador y se cortaba en el teléfono. */}
                    <div className="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] items-end gap-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-bold text-[#68778d]">{t("itemQty")}</span>
                        <input inputMode="decimal" value={r.quantity} onChange={(e) => setRow(r.id, { quantity: e.target.value.replace(/[^\d.,]/g, "").replace(",", ".") })} className={campo} />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-bold text-[#68778d]">{t("itemPrice")}</span>
                        <input inputMode="numeric" value={r.unit_price} onChange={(e) => setRow(r.id, { unit_price: proForm ? e.target.value.slice(0,32) : e.target.value.replace(/[^\d]/g, "") })} placeholder="0" className={campo} />
                      </label>
                    </div>
                    <p className="mt-2 flex items-baseline justify-between text-[13px]">
                      <span className="text-[#68778d]">{t("itemLineTotal")}</span>
                      <span className="font-extrabold text-[#162543]">{formatColones(totalLinea)}</span>
                    </p>
                  </div>
                );
              })}
            </div>
            {rows.length < QUOTE_MAX_ITEMS && (
              <button type="button" onClick={() => setRows((prev) => [...prev, nuevaFila()])} className="mt-2.5 inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed border-[#c7d5e2] px-4 text-[13px] font-bold text-[#0089bb] transition-colors hover:border-[#009FD9] hover:bg-[#f2fbfe]"><Plus className="h-4 w-4" />{t("addItem")}</button>
            )}
          </div>

          {/* Las condiciones van en la misma tarjeta: son tres datos del mismo
              documento y no ameritaban una caja aparte. */}
          <div className="mt-5 grid gap-4 border-t border-[#eef2f6] pt-4 sm:grid-cols-2">
            <div>
              <span className={rotulo}>{t("taxLabel")}</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setTaxMode("incluido")} className={pastilla(taxMode === "incluido")}>{t("taxIncludedShort")}</button>
                <button type="button" onClick={() => setTaxMode("mas_iva")} className={pastilla(taxMode === "mas_iva")}>{t("taxAddShort")}</button>
                <button type="button" onClick={() => setTaxMode("exento")} className={pastilla(taxMode === "exento")}>{t("taxExemptShort")}</button>
              </div>
            </div>
            <div>
              <span className={rotulo}>{t("validLabel")}</span>
              <div className="flex flex-wrap items-center gap-2">
                {[7, 15, 30].map((d) => (
                  <button key={d} type="button" onClick={() => setValidDays(d)} className={pastilla(validDays === d)}>{t("days", { count: d })}</button>
                ))}
                <span className="text-[13px] font-semibold text-[#52627a]">{t("validUntilShort", { date: validaHasta })}</span>
              </div>
            </div>
          </div>

          <label className="mt-4 block">
            <span className={rotulo}><EtiquetaOpcional>{t("notesLabel")}</EtiquetaOpcional></span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} placeholder={t("notesPlaceholder")} className={`${campo} resize-none`} />
          </label>
        </section>

        <Totales quote={{ ...totals, tax_mode: taxMode }} />
      </fieldset>
    </ModalComponent>
  );
}
