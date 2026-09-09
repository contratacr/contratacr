"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarCheck, Check, Download, Handshake, Loader2, Mail, Share2 } from "lucide-react";
import { ShareLinkPanel } from "@/components/ui/share-link-panel";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/ui/share-channels";
import { useNativeShare } from "@/hooks/use-native-share";
import { formatColones } from "@/lib/pricing";
import { enlaceCotizacion, nombreArchivoCotizacion, numeroCotizacion, whatsappDigits, type Quote } from "@/lib/quotes";
import { renderQuotePdf } from "@/lib/quote-image";

const DATE_LOCALE: Record<string, string> = { es: "es-CR", en: "en-US" };
const TILE = "flex flex-col items-center gap-2 rounded-2xl border border-[#e5eaf0] bg-white px-2 py-3.5 text-center transition-colors hover:border-[#bfe3f5] hover:bg-[#f8fcfe]";

/**
 * Cómo se manda una cotización: igual que "Compartir mi perfil" —enlace a la
 * vista, WhatsApp, Instagram, Facebook, correo, el PDF— y además a una cita o
 * un proyecto del app, que es donde el cliente la acepta.
 */
export function QuoteShare({ quote, proName, onChanged }: { quote: Quote; proName: string; onChanged?: (q: Quote) => void }) {
  const t = useTranslations("quotes");
  const locale = useLocale();
  const nativo = useNativeShare();
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [avisoInstagram, setAvisoInstagram] = useState(false);
  const preparando = pdf === null;
  const url = enlaceCotizacion(quote, proName);
  const mensaje = t("whatsappMessage", {
    name: quote.client_name ? ` ${quote.client_name.split(" ")[0]}` : "",
    title: quote.title ? ` de ${quote.title}` : "",
    total: formatColones(quote.total),
    url,
  });
  const digitos = whatsappDigits(quote.client_phone);
  const wa = `https://wa.me/${digitos}?text=${encodeURIComponent(mensaje)}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const correo = `mailto:${quote.client_email ?? ""}?subject=${encodeURIComponent(t("emailSubject", { number: numeroCotizacion(quote), name: proName }))}&body=${encodeURIComponent(mensaje)}`;
  const fecha = quote.valid_until ? new Date(`${quote.valid_until}T12:00:00`).toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { day: "numeric", month: "long" }) : null;

  useEffect(() => {
    let vivo = true;
    void renderQuotePdf(quote, proName, {
      titulo: quote.quote_number ? t("imageTitleNumbered", { number: numeroCotizacion(quote) }) : t("imageTitle"),
      cliente: t("clientLabel"), vigente: fecha ? t("imageValidUntil", { date: fecha }) : "",
      subtotal: t("subtotal"), iva: t("tax"), total: t("total"),
      totalNota: quote.tax_mode === "incluido" ? t("totalWithTax") : quote.tax_mode === "mas_iva" ? t("totalPlusTax") : t("totalNoTax"),
      pie: t("imageFooter"), deQuien: t("publicFrom"), nota: t("noteLabel"),
    }, fecha).then((b) => { if (vivo) setPdf(b); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id, quote.status, quote.booking_id, quote.project_id]);

  async function compartirPdf() {
    if (!pdf) return;
    const file = new File([pdf], `${nombreArchivoCotizacion(quote, proName)}.pdf`, { type: "application/pdf" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], title: quote.title ?? t("detailTitle"), text: mensaje }); return; } catch { /* cancelado */ }
    }
    descargarPdf();
  }
  function descargarPdf() {
    if (!pdf) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(pdf); a.download = `${nombreArchivoCotizacion(quote, proName)}.pdf`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  // Instagram no recibe enlaces desde el navegador: se copia y se abre.
  async function instagram() {
    try { await navigator.clipboard.writeText(url); } catch { /* sin portapapeles */ }
    setAvisoInstagram(true);
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
  }

  const enviadaA = quote.booking_id ? t("attachedBooking") : quote.project_id ? t("attachedProject") : null;

  return (
    <div className="flex flex-col gap-3">
      <ShareLinkPanel url={url} label={t("linkLabel")} copyLabel={t("copyLink")} copiedLabel={t("copied")} />
      <div className="grid grid-cols-3 gap-2.5">
        <a href={wa} target="_blank" rel="noopener noreferrer" className={TILE}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#25d366] text-white"><WhatsAppIcon className="h-5 w-5" /></span>
          <span className="text-[13px] font-bold text-[#162543]">WhatsApp</span>
        </a>
        <button type="button" onClick={() => void instagram()} className={TILE}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] text-white"><InstagramIcon className="h-5 w-5" /></span>
          <span className="text-[13px] font-bold text-[#162543]">Instagram</span>
        </button>
        <a href={fb} target="_blank" rel="noopener noreferrer" className={TILE}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#1877f2] text-white"><FacebookIcon className="h-5 w-5" /></span>
          <span className="text-[13px] font-bold text-[#162543]">Facebook</span>
        </a>
      </div>
      {avisoInstagram && <p className="rounded-2xl bg-[#eaf7fc] px-4 py-2.5 text-[13px] font-semibold leading-snug text-[#0b5f80]">{t("instagramHint")}</p>}
      <div className="grid grid-cols-2 gap-2.5">
        <a href={correo} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-4 text-[13px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb]">
          <Mail className="h-4 w-4" />{quote.client_email ? t("sendByEmail") : t("email")}
        </a>
        <button type="button" disabled={!pdf} onClick={() => void (nativo ? compartirPdf() : descargarPdf())} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-4 text-[13px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb] disabled:opacity-60">
          {preparando ? <Loader2 className="h-4 w-4 animate-spin" /> : nativo ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          PDF
        </button>
      </div>

      {/* Al app: pegada a una cita o a un proyecto, el cliente la ve y la acepta
          desde su panel. Es la forma de contacto del app; lo demás es repartirla. */}
      {enviadaA ? (
        <p className="inline-flex items-center gap-2 rounded-2xl bg-[#e9f9ef] px-4 py-3 text-[13px] font-bold text-[#166534]"><Check className="h-4 w-4" strokeWidth={3} />{enviadaA}</p>
      ) : quote.status === "sent" ? (
        <QuoteAttach quote={quote} onChanged={onChanged} />
      ) : null}
    </div>
  );
}

type Cita = { id: string; client_name?: string | null; service_description?: string | null; scheduled_date?: string | null; status: string };
type Propuesta = { id: string; project_id: string; status: string; projects?: { title?: string | null } | null };

/** Elegir a qué cita o proyecto del app se manda la cotización. */
function QuoteAttach({ quote, onChanged }: { quote: Quote; onChanged?: (q: Quote) => void }) {
  const t = useTranslations("quotes");
  const locale = useLocale();
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<"citas" | "proyectos">("citas");
  const [citas, setCitas] = useState<Cita[] | null>(null);
  const [propuestas, setPropuestas] = useState<Propuesta[] | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto || citas !== null) return;
    let vivo = true;
    void Promise.all([
      fetch("/api/bookings?role=professional", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/proposals?mine=true", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]).then(([b, p]) => {
      if (!vivo) return;
      const listaCitas: Cita[] = (Array.isArray(b?.bookings) ? b.bookings : Array.isArray(b) ? b : []) as Cita[];
      const listaProps: Propuesta[] = (Array.isArray(p?.proposals) ? p.proposals : Array.isArray(p) ? p : []) as Propuesta[];
      setCitas(listaCitas.filter((c) => ["pending", "confirmed", "in_progress", "awaiting_confirmation"].includes(c.status)));
      setPropuestas(listaProps.filter((x) => x.status === "pending" || x.status === "accepted"));
    });
    return () => { vivo = false; };
  }, [abierto, citas]);

  async function enviar(destino: { bookingId?: string; projectId?: string }, clave: string) {
    setEnviando(clave); setError(null);
    try {
      const res = await fetch("/api/quotes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: quote.id, action: "attach", ...destino }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? t("errorTitle")); return; }
      onChanged?.(d.quote as Quote);
    } catch { setError(t("errorTitle")); } finally { setEnviando(null); }
  }

  const fila = (clave: string, icono: React.ReactNode, titulo: string, detalle: string, destino: { bookingId?: string; projectId?: string }) => (
    <button key={clave} type="button" disabled={!!enviando} onClick={() => void enviar(destino, clave)} className="flex w-full items-center gap-3 rounded-2xl border border-[#e5eaf0] bg-white px-3.5 py-3 text-left transition-colors hover:border-[#bfe3f5] hover:bg-[#f8fcfe] disabled:opacity-60">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eaf7fc] text-[#009FD9]">{enviando === clave ? <Loader2 className="h-5 w-5 animate-spin" /> : icono}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-extrabold text-[#162543]">{titulo}</span>
        <span className="block truncate text-[12px] text-[#68778d]">{detalle}</span>
      </span>
    </button>
  );

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#162543] px-5 text-[14px] font-bold text-white transition-colors hover:bg-[#1d3557]">
        <CalendarCheck className="h-4 w-4" />{t("attachTitle")}
      </button>
    );
  }

  const cargando = citas === null;
  const listaCitas = citas ?? [];
  const listaProyectos = propuestas ?? [];
  const vacio = !cargando && listaCitas.length === 0 && listaProyectos.length === 0;
  const activos = pestana === "citas" ? listaCitas.length : listaProyectos.length;

  return (
    <div className="rounded-2xl border border-[#e5eaf0] bg-[#fafcfd] p-3">
      <p className="mb-2.5 text-[13px] font-bold text-[#162543]">{t("attachTitle")}</p>
      {/* Dos pestañas: primero se elige si va a una cita o a un proyecto, y
          debajo salen los que hay. Antes era una lista mezclada. */}
      <div className="mb-2.5 grid grid-cols-2 gap-1 rounded-full bg-[#eef3f8] p-1">
        {([["citas", t("attachTabBookings"), listaCitas.length], ["proyectos", t("attachTabProjects"), listaProyectos.length]] as const).map(([id, rotulo, cuantos]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPestana(id)}
            className={`h-9 rounded-full text-[13px] font-bold transition-colors ${pestana === id ? "bg-white text-[#0089bb] shadow-sm" : "text-[#52627a]"}`}
          >
            {rotulo}{cuantos > 0 ? ` (${cuantos})` : ""}
          </button>
        ))}
      </div>
      {cargando ? (
        <div className="flex flex-col gap-2">{[0, 1].map((i) => <div key={i} className="h-[62px] animate-pulse rounded-2xl bg-[#eef2f6]" />)}</div>
      ) : vacio || activos === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-5 text-center text-[13px] leading-5 text-[#68778d]">{t("attachEmpty")}</p>
      ) : (
        <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto">
          {pestana === "citas"
            ? listaCitas.map((c) => fila(`b-${c.id}`, <CalendarCheck className="h-5 w-5" />, c.client_name || c.service_description || t("noClientName"),
                [c.scheduled_date ? new Date(`${c.scheduled_date}T12:00:00`).toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { day: "numeric", month: "short" }) : "", c.service_description ?? ""].filter(Boolean).join(" · "),
                { bookingId: c.id }))
            : listaProyectos.map((p) => fila(`p-${p.id}`, <Handshake className="h-5 w-5" />, p.projects?.title || t("attachProjects"), t("attachProjects"), { projectId: p.project_id }))}
        </div>
      )}
      {error && <p className="mt-2 text-[13px] font-semibold text-red-600">{error}</p>}
    </div>
  );
}
