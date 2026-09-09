"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { CedulaInput } from "@/components/ui/cedula-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { cleanId, isValidId } from "@/lib/cedula";
import { Totales } from "@/components/quotes/quote-detail-modal";
import { quoteTotals, QUOTE_MAX_ITEMS, type Quote, type QuoteItem, type QuoteTaxMode } from "@/lib/quotes";

/**
 * Nueva cotización: para quién, qué incluye y cuánto. Un solo formulario, en
 * orden de lectura. La cédula trae el nombre del padrón (como en el registro),
 * el teléfono lleva su código de país, y el IVA es una sola fila de tres
 * opciones cortas en vez de tres tarjetas.
 */
type Row = { id: number; description: string; quantity: string; unit_price: string };
let seq = 1;
const nuevaFila = (): Row => ({ id: seq++, description: "", quantity: "1", unit_price: "" });

export function QuoteEditorModal({ open, onClose, bookingId, projectId, defaultTitle, onSent }: {
  open: boolean; onClose: () => void; bookingId?: string | null; projectId?: string | null; defaultTitle?: string;
  onSent: (quote: Quote) => void;
}) {
  const t = useTranslations("quotes");
  const suelta = !bookingId && !projectId;
  const [cedula, setCedula] = useState("");
  // "buscando" / "sin registro" se deducen de la cédula y del resultado, en vez
  // de escribirse desde el efecto (que dispara pintadas encadenadas).
  const [resultadoCedula, setResultadoCedula] = useState<{ id: string; encontrada: boolean } | null>(null);
  const cedulaLimpia = cleanId(cedula);
  const cedulaValida = isValidId(cedulaLimpia);
  const buscandoCedula = cedulaValida && resultadoCedula?.id !== cedulaLimpia;
  const cedulaSinRegistro = resultadoCedula?.id === cedulaLimpia && !resultadoCedula.encontrada;
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [rows, setRows] = useState<Row[]>([nuevaFila()]);
  const [taxMode, setTaxMode] = useState<QuoteTaxMode>("incluido");
  const [notes, setNotes] = useState("");
  const [validDays, setValidDays] = useState(15);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La cédula trae el nombre oficial, igual que en el registro. Es opcional:
  // quien no la sepa escribe el nombre a mano y listo.
  useEffect(() => {
    const limpia = cleanId(cedula);
    if (!isValidId(limpia)) return;
    let vivo = true;
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/cedula/${limpia}`);
        if (!vivo) return;
        if (res.ok) {
          const { fullName } = await res.json();
          if (fullName) setClientName(String(fullName).slice(0, 80));
          setResultadoCedula({ id: limpia, encontrada: !!fullName });
        } else setResultadoCedula({ id: limpia, encontrada: false });
      } catch { if (vivo) setResultadoCedula({ id: limpia, encontrada: false }); }
    }, 500);
    return () => { vivo = false; window.clearTimeout(id); };
  }, [cedula]);

  const items: QuoteItem[] = rows
    .map((r) => ({ description: r.description.trim(), quantity: Number(r.quantity), unit_price: Math.round(Number(r.unit_price.replace(/[^\d]/g, ""))) }))
    .filter((it) => it.description && it.quantity > 0 && Number.isFinite(it.unit_price) && it.unit_price >= 0);
  const totals = quoteTotals(items, taxMode);
  const setRow = (id: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const listo = items.length > 0 && (!suelta || clientName.trim().length > 0);

  async function enviar() {
    if (suelta && !clientName.trim()) { setError(t("errorNeedsClient")); return; }
    if (items.length === 0) { setError(t("errorNeedsItems")); return; }
    setSending(true); setError(null);
    try {
      const res = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId, projectId, clientName, clientPhone, clientEmail, clientCedula: cleanId(cedula), title, items, taxMode, notes, validDays }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(res.status === 503 ? t("errorUnavailable") : d.error ?? t("errorTitle")); return; }
      onSent(d.quote as Quote);
      setRows([nuevaFila()]); setNotes(""); setTitle(defaultTitle ?? ""); setClientName(""); setClientPhone(""); setClientEmail(""); setCedula("");
    } catch { setError(t("errorTitle")); } finally { setSending(false); }
  }

  const campo = "w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[15px] text-[#162543] placeholder:text-[#8f9aaa] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]";
  const rotulo = "mb-2 block text-[13px] font-bold text-[#162543]";
  const pastilla = (activa: boolean) => `h-10 shrink-0 rounded-full border px-4 text-[13px] font-bold transition-colors ${activa ? "border-[#009FD9] bg-[#eaf7fc] text-[#0089bb]" : "border-[#d7e1ea] bg-white text-[#52627a] hover:bg-[#f6f9fb]"}`;
  const bloque = "rounded-2xl border border-[#e5eaf0] bg-white p-4";

  return (
    <Modal open={open} onClose={onClose} title={t("editorTitle")} subtitle={suelta ? undefined : t("editorSubtitle")} size="md" mobilePresentation="fullscreen" closeLabel={t("close")}
      footerNotice={error ? <p className="text-sm font-semibold text-red-600">{error}</p> : undefined}
      footerClassName="px-4 sm:px-6"
      footer={(
        <Button type="button" size="lg" className="w-full" onClick={() => void enviar()} disabled={sending || !listo} loading={sending}>
          {sending ? (suelta ? t("creating") : t("sending")) : (suelta ? t("create") : t("send"))}
        </Button>
      )}>
      <div className="flex flex-col gap-4">
        {suelta && (
          <section className={bloque}>
            <span className={rotulo}>{t("forWhomLabel")}</span>
            <div className="flex flex-col gap-3">
              <div>
                <CedulaInput value={cedula} onChange={setCedula} labelText={t("clientCedulaLabel")} hint={t("clientCedulaHint")} />
                {buscandoCedula && <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0089bb]"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("clientCedulaSearching")}</p>}
                {cedulaSinRegistro && <p className="mt-1.5 text-[12px] text-[#68778d]">{t("clientCedulaNotFound")}</p>}
              </div>
              <label className="block">
                <span className={rotulo}>{t("clientNameLabel")}</span>
                <input value={clientName} onChange={(e) => setClientName(e.target.value.slice(0, 80))} placeholder={t("clientNamePlaceholder")} className={campo} />
              </label>
              <PhoneInput value={clientPhone} onChange={setClientPhone} label={t("clientPhoneLabel")} optional />
              <label className="block">
                <span className={rotulo}>{t("clientEmailLabel")}</span>
                <input type="email" inputMode="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value.slice(0, 120))} placeholder={t("clientEmailPlaceholder")} className={campo} />
              </label>
              <p className="text-[12px] leading-snug text-[#68778d]">{t("clientContactHint")}</p>
            </div>
          </section>
        )}

        <section className={bloque}>
          <label className="block">
            <span className={rotulo}>{t("titleLabel")}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t("titlePlaceholder")} className={campo} />
          </label>

          <div className="mt-4">
            <span className={rotulo}>{t("itemsLabel")}</span>
            <div className="flex flex-col gap-2">
              {rows.map((r) => (
                <div key={r.id} className="rounded-2xl border border-[#e5eaf0] bg-[#fafcfd] p-3">
                  <input value={r.description} onChange={(e) => setRow(r.id, { description: e.target.value })} maxLength={140} placeholder={t("itemDescription")} className={campo} />
                  <div className="mt-2 grid grid-cols-[84px_minmax(0,1fr)_40px] items-center gap-2">
                    <label className="block"><span className="sr-only">{t("itemQty")}</span><input inputMode="decimal" value={r.quantity} onChange={(e) => setRow(r.id, { quantity: e.target.value.replace(/[^\d.,]/g, "").replace(",", ".") })} placeholder={t("itemQty")} className={campo} /></label>
                    <label className="block"><span className="sr-only">{t("itemPrice")}</span><input inputMode="numeric" value={r.unit_price} onChange={(e) => setRow(r.id, { unit_price: e.target.value.replace(/[^\d]/g, "") })} placeholder={t("itemPrice")} className={campo} /></label>
                    <button type="button" aria-label={t("removeItem")} disabled={rows.length === 1} onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))} className="grid h-10 w-10 place-items-center rounded-full text-[#8f9aaa] transition-colors hover:bg-[#fef2f2] hover:text-red-600 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            {rows.length < QUOTE_MAX_ITEMS && (
              <button type="button" onClick={() => setRows((prev) => [...prev, nuevaFila()])} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#009FD9] hover:underline"><Plus className="h-4 w-4" />{t("addItem")}</button>
            )}
          </div>

          <div className="mt-4">
            <span className={rotulo}>{t("taxLabel")}</span>
            <div className="scrollbar-none flex gap-2 overflow-x-auto">
              <button type="button" onClick={() => setTaxMode("incluido")} className={pastilla(taxMode === "incluido")}>{t("taxIncludedShort")}</button>
              <button type="button" onClick={() => setTaxMode("mas_iva")} className={pastilla(taxMode === "mas_iva")}>{t("taxAddShort")}</button>
              <button type="button" onClick={() => setTaxMode("exento")} className={pastilla(taxMode === "exento")}>{t("taxExemptShort")}</button>
            </div>
          </div>

          <div className="mt-4">
            <span className={rotulo}>{t("validLabel")}</span>
            <div className="flex gap-2">
              {[7, 15, 30].map((d) => (
                <button key={d} type="button" onClick={() => setValidDays(d)} className={pastilla(validDays === d)}>{t("days", { count: d })}</button>
              ))}
            </div>
          </div>

          <label className="mt-4 block">
            <span className={rotulo}>{t("notesLabel")}</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} placeholder={t("notesPlaceholder")} className={`${campo} resize-none`} />
          </label>
        </section>

        <Totales quote={{ ...totals, tax_mode: taxMode }} />
      </div>
    </Modal>
  );
}
