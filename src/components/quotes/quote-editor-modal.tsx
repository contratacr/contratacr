"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { formatColones } from "@/lib/pricing";
import { quoteTotals, QUOTE_MAX_ITEMS, type Quote, type QuoteItem, type QuoteTaxMode } from "@/lib/quotes";

/**
 * El profesional arma la cotización: para quién (cuando no va sobre una cita o
 * un proyecto), renglones, IVA, notas y vigencia. Un solo formulario, en orden
 * de lectura, sin pasos.
 */
type Row = { id: number; description: string; quantity: string; unit_price: string };
let seq = 1;
const nuevaFila = (): Row => ({ id: seq++, description: "", quantity: "1", unit_price: "" });

export function QuoteEditorModal({ open, onClose, bookingId, projectId, defaultTitle, onSent }: {
  open: boolean; onClose: () => void; bookingId?: string | null; projectId?: string | null; defaultTitle?: string; onSent: (quote: Quote) => void;
}) {
  const t = useTranslations("quotes");
  const suelta = !bookingId && !projectId;
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [rows, setRows] = useState<Row[]>([nuevaFila()]);
  const [taxMode, setTaxMode] = useState<QuoteTaxMode>("incluido");
  const [notes, setNotes] = useState("");
  const [validDays, setValidDays] = useState(15);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId, projectId, clientName, clientPhone, title, items, taxMode, notes, validDays }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(res.status === 503 ? t("errorUnavailable") : d.error ?? t("errorTitle")); return; }
      onSent(d.quote as Quote);
      setRows([nuevaFila()]); setNotes(""); setTitle(defaultTitle ?? ""); setClientName(""); setClientPhone("");
    } catch { setError(t("errorTitle")); } finally { setSending(false); }
  }

  const campo = "w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 text-[15px] text-[#162543] placeholder:text-[#8f9aaa] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]";
  const rotulo = "mb-1.5 block text-[13px] font-bold text-[#162543]";
  const radio = (value: QuoteTaxMode, label: string) => (
    <label className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[14px] ${taxMode === value ? "border-[#009FD9] bg-[#f4fbfe] text-[#162543]" : "border-[#e5e7eb] text-[#52627a]"}`}>
      <input type="radio" name="taxMode" checked={taxMode === value} onChange={() => setTaxMode(value)} className="h-4 w-4 accent-[#009FD9]" />{label}
    </label>
  );

  return (
    <Modal open={open} onClose={onClose} title={t("editorTitle")} subtitle={suelta ? t("sectionIntro") : t("editorSubtitle")} size="md" mobilePresentation="fullscreen" closeLabel={t("close")}
      footerNotice={error ? <p className="text-sm font-semibold text-red-600">{error}</p> : undefined}
      footer={(<>
        <Button type="button" variant="secondary" onClick={onClose} disabled={sending}>{t("cancel")}</Button>
        <Button type="button" onClick={() => void enviar()} disabled={sending || !listo} loading={sending}>
          {sending ? (suelta ? t("creating") : t("sending")) : (suelta ? t("create") : t("send"))}
        </Button>
      </>)}>
      <div className="flex flex-col gap-5">
        {suelta && (
          <div className="rounded-2xl border border-[#e5eaf0] bg-[#fafcfd] p-3.5">
            <span className={rotulo}>{t("forWhomLabel")}</span>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} maxLength={80} placeholder={t("clientNamePlaceholder")} aria-label={t("clientNameLabel")} className={campo} autoFocus />
            <div className="mt-2">
              <input inputMode="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value.replace(/[^\d+\-\s]/g, ""))} maxLength={20} placeholder={t("clientPhonePlaceholder")} aria-label={t("clientPhoneLabel")} className={campo} />
              <p className="mt-1.5 text-[12px] text-[#68778d]">{t("clientPhoneHint")}</p>
            </div>
          </div>
        )}
        <label className="block">
          <span className={rotulo}>{t("titleLabel")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t("titlePlaceholder")} className={campo} />
        </label>
        <div>
          <span className={rotulo}>{t("itemsLabel")}</span>
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-2xl border border-[#e5eaf0] bg-[#fafcfd] p-3">
                <input value={r.description} onChange={(e) => setRow(r.id, { description: e.target.value })} maxLength={140} placeholder={t("itemDescription")} className={campo} />
                <div className="mt-2 grid grid-cols-[88px_minmax(0,1fr)_40px] items-center gap-2">
                  <label className="block"><span className="sr-only">{t("itemQty")}</span><input inputMode="decimal" value={r.quantity} onChange={(e) => setRow(r.id, { quantity: e.target.value.replace(/[^\d.,]/g, "").replace(",", ".") })} placeholder={t("itemQty")} className={campo} /></label>
                  <label className="block"><span className="sr-only">{t("itemPrice")}</span><input inputMode="numeric" value={r.unit_price} onChange={(e) => setRow(r.id, { unit_price: e.target.value.replace(/[^\d]/g, "") })} placeholder={t("itemPrice")} className={campo} /></label>
                  <button type="button" aria-label={t("removeItem")} disabled={rows.length === 1} onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))} className="grid h-10 w-10 place-items-center rounded-full text-[#8f9aaa] hover:bg-[#fef2f2] hover:text-red-600 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
          {rows.length < QUOTE_MAX_ITEMS && (
            <button type="button" onClick={() => setRows((prev) => [...prev, nuevaFila()])} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#009FD9] hover:underline"><Plus className="h-4 w-4" />{t("addItem")}</button>
          )}
        </div>
        <div>
          <span className={rotulo}>{t("taxLabel")}</span>
          <div className="grid gap-2 sm:grid-cols-3">{radio("incluido", t("taxIncluded"))}{radio("mas_iva", t("taxAdd"))}{radio("exento", t("taxExempt"))}</div>
        </div>
        <label className="block">
          <span className={rotulo}>{t("validLabel")}</span>
          <select value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} className={campo}>
            {[7, 15, 30].map((d) => <option key={d} value={d}>{t("days", { count: d })}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={rotulo}>{t("notesLabel")}</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} placeholder={t("notesPlaceholder")} className={`${campo} resize-none`} />
        </label>
        <div className="rounded-2xl bg-[#f4f7fa] px-4 py-3 text-[14px]">
          <div className="flex justify-between text-[#52627a]"><span>{t("subtotal")}</span><span>{formatColones(totals.subtotal)}</span></div>
          {taxMode !== "exento" && <div className="mt-1 flex justify-between text-[#52627a]"><span>{t("tax")}</span><span>{formatColones(totals.tax_amount)}</span></div>}
          <div className="mt-2 flex justify-between border-t border-[#dbe4ee] pt-2 text-[16px] font-extrabold text-[#162543]"><span>{t("total")}</span><span>{formatColones(totals.total)} <span className="text-[11px] font-semibold text-[#68778d]">{t("ivaIncluded")}</span></span></div>
        </div>
      </div>
    </Modal>
  );
}
