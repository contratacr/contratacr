"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Check, Printer } from "lucide-react";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatColones } from "@/lib/pricing";
import { getInitials } from "@/lib/utils";
import { cldThumb } from "@/lib/cloudinary";
import { isQuoteExpired, type Quote } from "@/lib/quotes";

export type PublicQuoteData = {
  quote: Quote;
  pro: { name: string; avatarUrl: string | null; verified: boolean; whatsapp: string; profileUrl: string | null; oficio: string };
};

const DATE_LOCALE: Record<string, string> = { es: "es-CR", en: "en-US" };

/**
 * Lo que ve el cliente al abrir el enlace: quién cotiza, qué incluye, cuánto
 * es, y un botón para aceptar. Nada que descargar ni cuenta que crear. Es
 * también la puerta por la que ese cliente entra a ContrataCR.
 */
export function PublicQuote({ locale, data }: { locale: string; data: PublicQuoteData | null }) {
  const t = useTranslations("quotes");
  const [estado, setEstado] = useState<Quote["status"] | null>(data?.quote.status ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data || !estado) {
    return (
      <Marco>
        <div className="rounded-3xl border border-[#e5eaf0] bg-white px-6 py-12 text-center shadow-sm">
          <h1 className="text-[22px] font-extrabold text-[#162543]">{t("publicNotFound")}</h1>
          <p className="mt-2 text-[15px] leading-6 text-[#52627a]">{t("publicNotFoundBody")}</p>
        </div>
      </Marco>
    );
  }
  const { quote, pro } = data;
  const vencida = estado === "sent" && isQuoteExpired({ ...quote, status: estado });
  const abierta = estado === "sent" && !vencida;
  const fecha = quote.valid_until ? new Date(`${quote.valid_until}T12:00:00`).toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { day: "numeric", month: "long" }) : null;
  const wa = pro.whatsapp ? `https://wa.me/${pro.whatsapp}` : null;
  const oficio = pro.oficio;

  async function responder(action: "accept" | "decline") {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/quotes/public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: quote.public_code, action }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? t("errorTitle")); return; }
      setEstado(d.status);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch { setError(t("errorTitle")); } finally { setBusy(false); }
  }

  return (
    <Marco>
      {/* Resultado, arriba de todo, cuando ya respondió. */}
      {estado === "accepted" && (
        <div className="print:hidden mb-4 rounded-3xl bg-[#162543] px-6 py-6 text-center text-white">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#25d366]"><Check className="h-6 w-6" strokeWidth={3} /></span>
          <h2 className="mt-3 text-[22px] font-extrabold">{t("publicAcceptedTitle")}</h2>
          <p className="mt-1 text-[15px] leading-6 text-[#c7dcec]">{t("publicAcceptedBody", { name: pro.name })}</p>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-[#25d366] px-6 text-[14px] font-bold text-white hover:bg-[#1da851]">{t("publicWhatsApp")}</a>}
        </div>
      )}
      {estado === "declined" && (
        <div className="print:hidden mb-4 rounded-3xl border border-[#e5eaf0] bg-white px-6 py-5 text-center">
          <h2 className="text-[18px] font-extrabold text-[#162543]">{t("publicDeclinedTitle")}</h2>
          <p className="mt-1 text-[14px] leading-6 text-[#52627a]">{t("publicDeclinedBody", { name: pro.name })}</p>
        </div>
      )}
      {(estado === "withdrawn") && (
        <div className="print:hidden mb-4 rounded-3xl border border-[#e5eaf0] bg-white px-6 py-5 text-center">
          <h2 className="text-[18px] font-extrabold text-[#162543]">{t("publicClosedTitle")}</h2>
        </div>
      )}
      {vencida && (
        <div className="print:hidden mb-4 rounded-3xl border border-[#e5eaf0] bg-white px-6 py-5 text-center">
          <h2 className="text-[18px] font-extrabold text-[#162543]">{t("publicExpiredTitle")}</h2>
          <p className="mt-1 text-[14px] leading-6 text-[#52627a]">{t("publicExpiredBody", { name: pro.name })}</p>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-10 items-center justify-center rounded-full bg-[#25d366] px-5 text-[13px] font-bold text-white hover:bg-[#1da851]">{t("publicWhatsApp")}</a>}
        </div>
      )}

      <article className="overflow-hidden rounded-3xl border border-[#e5eaf0] bg-white shadow-sm print:border-0 print:shadow-none">
        {/* Quién cotiza. */}
        <div className="flex items-center gap-4 border-b border-[#eef2f6] px-6 py-5">
          <Avatar className="h-16 w-16 shrink-0">
            <AvatarImage src={pro.avatarUrl ? cldThumb(pro.avatarUrl, 160) : undefined} alt={pro.name} className="object-cover" />
            <AvatarFallback className="bg-[#EBF5FB] text-lg font-bold text-[#009FD9]">{getInitials(pro.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#68778d]">{t("publicFrom")}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[19px] font-extrabold leading-tight text-[#162543]">
              <span className="min-w-0 truncate">{pro.name}</span>
              {pro.verified && <VerifiedSeal className="h-4 w-4 shrink-0 text-[#009FD9]" label={t("publicIdentityVerified")} />}
            </p>
            {oficio && <p className="mt-0.5 text-[13px] text-[#52627a]">{oficio}</p>}
          </div>
        </div>

        <div className="px-6 py-5">
          {(quote.title || quote.client_name) && (
            <div className="mb-4">
              {quote.title && <h1 className="text-[20px] font-extrabold leading-snug text-[#162543]">{quote.title}</h1>}
              {quote.client_name && <p className="mt-1 text-[14px] text-[#52627a]">{t("clientLabel")}: <span className="font-semibold text-[#162543]">{quote.client_name}</span></p>}
            </div>
          )}
          <div className="divide-y divide-[#eef2f6] overflow-hidden rounded-2xl border border-[#e5eaf0]">
            {quote.items.map((it, i) => (
              <div key={i} className="flex items-start justify-between gap-3 px-4 py-3 text-[15px]">
                <span className="min-w-0 flex-1 text-[#162543]">{it.description}<span className="ml-1.5 text-[12px] text-[#68778d]">× {it.quantity}</span></span>
                <span className="shrink-0 font-bold text-[#162543]">{formatColones(Math.round(it.quantity * it.unit_price))}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-2xl bg-[#f4f7fa] px-4 py-3 text-[14px]">
            <div className="flex justify-between text-[#52627a]"><span>{t("subtotal")}</span><span>{formatColones(quote.subtotal)}</span></div>
            {quote.tax_mode !== "exento" && <div className="mt-1 flex justify-between text-[#52627a]"><span>{t("tax")}</span><span>{formatColones(quote.tax_amount)}</span></div>}
            <div className="mt-2 flex justify-between border-t border-[#dbe4ee] pt-2 text-[18px] font-extrabold text-[#162543]"><span>{t("total")}</span><span>{formatColones(quote.total)} <span className="text-[11px] font-semibold text-[#68778d]">{t("ivaIncluded")}</span></span></div>
          </div>
          {quote.notes && <p className="mt-4 whitespace-pre-line text-[14px] leading-6 text-[#52627a]">{quote.notes}</p>}
          {fecha && abierta && <p className="mt-4 text-[13px] text-[#68778d]">{t("validUntil", { date: fecha })}</p>}
        </div>

        {abierta && (
          <div className="print:hidden flex flex-col gap-2 border-t border-[#eef2f6] bg-[#fafcfd] px-6 py-5">
            <Button type="button" size="lg" className="w-full" loading={busy} disabled={busy} onClick={() => void responder("accept")}>{t("publicAccept")}</Button>
            <button type="button" disabled={busy} onClick={() => void responder("decline")} className="h-11 w-full rounded-full text-[14px] font-bold text-[#52627a] transition-colors hover:bg-[#f0f4f8]">{t("publicDecline")}</button>
            {error && <p className="text-center text-sm font-semibold text-red-600">{error}</p>}
          </div>
        )}
      </article>

      <div className="print:hidden mt-4 flex flex-col gap-2 sm:flex-row">
        {pro.profileUrl && <a href={pro.profileUrl} className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-5 text-[14px] font-bold text-[#162543] hover:bg-[#f6f9fb]">{t("publicViewProfile")}</a>}
        <button type="button" onClick={() => window.print()} className="hidden h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-5 text-[14px] font-bold text-[#162543] hover:bg-[#f6f9fb] sm:inline-flex"><Printer className="h-4 w-4" />{t("publicPrint")}</button>
      </div>

      <p className="print:hidden mt-8 text-center text-[13px] leading-6 text-[#68778d]">
        {t("publicFooter")} <Link href="/registro/profesional" className="font-bold text-[#009FD9] hover:underline">{t("publicFooterCta")}</Link>
      </p>
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f7fa] print:bg-white">
      <header className="print:hidden border-b border-[#e3ebf2] bg-white">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- logotipo estático, sin optimizador */}
          <Link href="/" aria-label="ContrataCR"><img src="/logo-wordmark-transparent.png" alt="ContrataCR" className="h-8 w-auto" /></Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
