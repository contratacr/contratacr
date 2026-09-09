"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Download, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { formatColones } from "@/lib/pricing";
import { desgloseQuote, isQuoteExpired, nombreArchivoCotizacion, numeroCotizacion, whatsappDigits, type Quote } from "@/lib/quotes";
import { renderQuotePdf } from "@/lib/quote-image";
import { QuoteShare } from "@/components/quotes/quote-share";

const DATE_LOCALE: Record<string, string> = { es: "es-CR", en: "en-US" };

/**
 * La cotización completa. El cliente la acepta o no; el profesional la manda
 * (enlace, WhatsApp, imagen) y puede retirarla. `recienCreada` es la pantalla
 * de "lista para enviar" justo después de crearla.
 */
/** Base + IVA = total. Con el IVA dentro del precio, el subtotal es la base. */
export function Totales({ quote }: { quote: Pick<Quote, "subtotal" | "tax_amount" | "total" | "tax_mode"> }) {
  const t = useTranslations("quotes");
  const m = desgloseQuote(quote);
  const nota = quote.tax_mode === "incluido" ? t("totalWithTax") : quote.tax_mode === "mas_iva" ? t("totalPlusTax") : t("totalNoTax");
  return (
    <div className="rounded-2xl bg-[#f4f7fa] px-4 py-3.5 text-[14px]">
      <div className="flex justify-between text-[#52627a]"><span>{t("subtotal")}</span><span>{formatColones(m.base)}</span></div>
      {quote.tax_mode !== "exento" && <div className="mt-1 flex justify-between text-[#52627a]"><span>{t("tax")}</span><span>{formatColones(m.iva)}</span></div>}
      <div className="mt-2.5 flex items-baseline justify-between border-t border-[#dbe4ee] pt-2.5 text-[17px] font-extrabold text-[#162543]">
        <span>{t("total")}</span><span>{formatColones(m.total)}</span>
      </div>
      <p className="mt-0.5 text-right text-[12px] font-semibold text-[#68778d]">{nota}</p>
    </div>
  );
}

export function QuoteDetailModal({ quote, role, open, onClose, onChanged, proName, proSlug, recienCreada = false }: {
  quote: Quote; role: "client" | "pro"; open: boolean; onClose: () => void; onChanged: (q: Quote) => void; proName?: string; proSlug?: string | null; recienCreada?: boolean;
}) {
  const t = useTranslations("quotes");
  const locale = useLocale();
  const { dialogNode, confirm, showMessage } = useAppDialog();
  const [busy, setBusy] = useState(false);
  const [pdfCliente, setPdfCliente] = useState<Blob | null>(null);
  const expirada = isQuoteExpired(quote);
  // Sin cita ni proyecto detrás no hay quién responda: no se anuncia una espera.
  const enElApp = !!(quote.booking_id || quote.project_id);
  const estado = expirada
    ? t("statusExpired")
    : quote.status === "sent"
      ? (enElApp ? t("statusSent") : null)
      : quote.status === "accepted" ? t("statusAccepted") : quote.status === "declined" ? t("statusDeclined") : t("statusWithdrawn");
  const fecha = quote.valid_until ? new Date(`${quote.valid_until}T12:00:00`).toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { day: "numeric", month: "long" }) : null;

  async function actuar(action: "accept" | "decline" | "withdraw") {
    const textos = action === "accept"
      ? { title: t("acceptConfirmTitle"), description: t("acceptConfirmBody"), confirmLabel: t("acceptConfirm") }
      : action === "decline"
        ? { title: t("declineConfirmTitle"), description: t("declineConfirmBody"), confirmLabel: t("declineConfirm"), tone: "danger" as const }
        : { title: t("withdrawConfirmTitle"), description: t("withdrawConfirmBody"), confirmLabel: t("withdrawConfirm"), tone: "danger" as const };
    const { confirmed } = await confirm(textos);
    if (!confirmed) return;
    setBusy(true);
    try {
      const res = await fetch("/api/quotes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: quote.id, action }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { await showMessage({ title: t("errorTitle"), description: d.error ?? "", tone: "danger" }); return; }
      onChanged(d.quote as Quote);
      if (action === "accept") await showMessage({ title: t("acceptedTitle"), description: t("acceptedBody"), tone: "success" });
      else if (action === "decline") await showMessage({ title: t("declinedTitle"), description: t("declinedBody") });
      onClose();
    } finally { setBusy(false); }
  }

  // El cliente también se lleva el documento: ver arriba, descargar aquí.
  useEffect(() => {
    if (role !== "client") return;
    let vivo = true;
    void renderQuotePdf(quote, quote.professional_name ?? "", {
      titulo: quote.quote_number ? t("imageTitleNumbered", { number: numeroCotizacion(quote) }) : t("imageTitle"),
      cliente: t("clientLabel"), vigente: fecha ? t("imageValidUntil", { date: fecha }) : "",
      subtotal: t("subtotal"), iva: t("tax"), total: t("total"),
      totalNota: quote.tax_mode === "incluido" ? t("totalWithTax") : quote.tax_mode === "mas_iva" ? t("totalPlusTax") : t("totalNoTax"),
      pie: t("imageFooter"), deQuien: t("publicFrom"), nota: t("noteLabel"),
    }, fecha).then((b) => { if (vivo) setPdfCliente(b); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id, role]);

  function descargarCliente() {
    if (!pdfCliente) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(pdfCliente);
    a.download = `${nombreArchivoCotizacion(quote, quote.professional_name ?? "")}.pdf`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const puedeResponder = role === "client" && quote.status === "sent" && !expirada;
  const puedeRetirar = role === "pro" && quote.status === "sent";
  const abierta = quote.status === "sent" && !expirada;
  // El título del encabezado en UNA línea: el nombre del trabajo puede ser largo
  // y partido en tres renglones empujaba todo hacia abajo.
  const titulo = recienCreada
    ? t("readyTitle")
    : <span className="block truncate">{quote.quote_number ? `${t("rowQuote")} N.º ${numeroCotizacion(quote)}` : (quote.title || t("detailTitle"))}</span>;
  const subtitulo = recienCreada
    ? t("readyBody")
    : role === "client"
      ? (quote.professional_name ? t("from", { name: quote.professional_name }) : quote.title ?? undefined)
      : [quote.client_name, quote.title].filter(Boolean).join(" · ") || undefined;

  return (
    <>
      <Modal open={open} onClose={onClose} title={titulo} subtitle={subtitulo} size="sm" mobilePresentation="fullscreen" closeLabel={t("close")}
        footer={puedeResponder ? (<>
          <Button type="button" variant="secondary" className="w-full sm:w-auto" disabled={busy} onClick={() => void actuar("decline")}>{t("decline")}</Button>
          <Button type="button" className="w-full sm:w-auto" disabled={busy} loading={busy} onClick={() => void actuar("accept")}>{t("accept")}</Button>
        </>) : puedeRetirar && !recienCreada ? (
          <Button type="button" variant="secondary" className="w-full sm:w-auto" disabled={busy} onClick={() => void actuar("withdraw")}>{t("withdraw")}</Button>
        ) : undefined}
        footerClassName="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <div className="flex flex-col gap-4">
          {recienCreada && (
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e9f9ef] text-[#166534]"><Check className="h-6 w-6" strokeWidth={3} /></span>
          )}
          {/* Para el profesional, primero cómo mandarla: es a lo que viene. */}
          {role === "pro" && abierta && <QuoteShare quote={quote} proName={proName ?? quote.professional_name ?? ""} proSlug={proSlug} onChanged={onChanged} />}
          {/* Aceptada: lo único que queda es ponerse de acuerdo. */}
          {role === "pro" && quote.status === "accepted" && (
            <div className="rounded-2xl bg-[#f0fdf4] px-4 py-3.5 text-center">
              <p className="text-[15px] font-extrabold text-[#166534]">{t("statusAccepted")}</p>
              {quote.accepted_at && <p className="mt-0.5 text-[13px] text-[#3f7c53]">{t("acceptedOn", { date: new Date(quote.accepted_at).toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { day: "numeric", month: "long" }) })}</p>}
              {whatsappDigits(quote.client_phone) && (
                <a href={`https://wa.me/${whatsappDigits(quote.client_phone)}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#25d366] px-5 text-[14px] font-bold text-white transition-colors hover:bg-[#1da851]">
                  {t("writeClient")}
                </a>
              )}
            </div>
          )}
          {!recienCreada && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              {estado && <span className={`rounded-full px-2.5 py-1 font-bold ${quote.status === "accepted" ? "bg-[#eaf7fc] text-[#0089bb]" : abierta ? "bg-[#f4f7fa] text-[#52627a]" : "bg-[#f3f4f6] text-[#6b7280]"}`}>{estado}</span>}
              {fecha && quote.status === "sent" && <span className="text-[#68778d]">{t("validUntil", { date: fecha })}</span>}
            </div>
          )}
          <div className="divide-y divide-[#eef2f6] overflow-hidden rounded-2xl border border-[#e5eaf0]">
            {quote.items.map((it, i) => (
              <div key={i} className="flex items-start justify-between gap-3 px-4 py-3 text-[14px]">
                <span className="min-w-0 flex-1 text-[#162543]">{it.description}<span className="ml-1.5 text-[12px] text-[#68778d]">× {it.quantity}</span></span>
                <span className="shrink-0 font-bold text-[#162543]">{formatColones(it.quantity * it.unit_price)}</span>
              </div>
            ))}
          </div>
          <Totales quote={quote} />
          {quote.notes && <p className="whitespace-pre-line text-[14px] leading-6 text-[#52627a]">{quote.notes}</p>}
          {role === "client" && (
            <button type="button" disabled={!pdfCliente} onClick={descargarCliente} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-5 text-[14px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb] disabled:opacity-60">
              {pdfCliente ? <Download className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}{t("downloadClient")}
            </button>
          )}
        </div>
      </Modal>
      {dialogNode}
    </>
  );
}
