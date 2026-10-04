"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Briefcase, BriefcaseBusiness, ClipboardList, ImagePlus, ReceiptText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { OfferTagPercentIcon } from "@/components/icons/offer-tag-percent-icon";
import { EMPLEOS_VISIBLE } from "@/lib/feature-flags";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

/**
 * LO QUE ABRE EL «+» DEL MENÚ DE ABAJO, como el «Crear» de Facebook: tres
 * opciones en lista —proyecto, promoción y empleo, en ese orden— cada una con
 * una línea que explica qué hace. A quien no es profesional se le dice en cada una; al
 * tocarla, esas páginas lo llevan a registrarse como profesional.
 */
export function HojaDeCrear({ abierta, onCerrar, esProfesional }: { abierta: boolean; onCerrar: () => void; esProfesional: boolean; avatarUrl?: string | null }) {
  const t = useTranslations("bottomNav");
  const arrastre = useRef<{ y: number } | null>(null);
  const hojaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!abierta) return;
    const soltar = lockBodyScroll();
    const alTeclado = (event: KeyboardEvent) => { if (event.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", alTeclado);
    return () => { soltar(); window.removeEventListener("keydown", alTeclado); };
  }, [abierta, onCerrar]);

  if (!abierta || typeof document === "undefined") return null;

  // LAS MISMAS TARJETAS DE «¿CÓMO QUIERES EMPEZAR?» del registro: mosaico con
  // degradado, ícono a línea, título y una línea celeste debajo. Dos por fila.
  // Cliente o sin sesión: proyecto y ofrecer servicios. Profesional: caso de
  // éxito, proyecto, promoción (y empleo si está visible).
  const icono = "h-10 w-10 text-[#162543]";
  const opciones = esProfesional
    ? [
        { href: "/dashboard/profesional?tab=photos&nuevo=1", titulo: t("tileCase"), linea: t("tileCaseSub"), mosaico: "ccr-mosaico-pro", Icono: ImagePlus },
        { href: "/publicar-proyecto", titulo: t("tileProject"), linea: t("createProjectAsk"), mosaico: "ccr-mosaico-cliente", Icono: ClipboardList },
        { href: "/promociones/publicar", titulo: t("tileDeal"), linea: t("tileDealSub"), mosaico: "ccr-mosaico-cliente", Icono: OfferTagPercentIcon },
        ...(EMPLEOS_VISIBLE ? [{ href: "/empleos/publicar", titulo: t("tileJob"), linea: t("tileJobSub"), mosaico: "ccr-mosaico-pro", Icono: Briefcase }] : []),
      ]
    : [
        { href: "/publicar-proyecto", titulo: t("tileProjectPost"), linea: t("createProjectAsk"), mosaico: "ccr-mosaico-cliente", Icono: ClipboardList },
        { href: "/cotizar", titulo: t("tileQuote"), linea: t("tileQuoteSub"), mosaico: "ccr-mosaico-pro", Icono: ReceiptText },
        { href: "/registro/profesional", titulo: t("tileOffer"), linea: t("tileOfferSub"), mosaico: "ccr-mosaico-pro", Icono: BriefcaseBusiness },
      ];

  return createPortal(
    <div className="app-modal-screen app-sheet-compact-screen fixed inset-0 z-[240] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={t("createTitle")}>
      <div className="absolute inset-0 bg-[#071426]/40 backdrop-blur-[2px]" onClick={onCerrar} />
      <div
        ref={hojaRef}
        className="app-bottom-sheet app-sheet-compact relative z-10 w-full max-w-md rounded-t-[26px] bg-[#f4f7fa] px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_48px_-24px_rgba(15,23,42,0.55)]"
        // Arrastrar la hoja hacia abajo la cierra, como en Facebook.
        onPointerDown={(event) => { if (event.pointerType !== "mouse") arrastre.current = { y: event.clientY }; }}
        onPointerMove={(event) => {
          const inicio = arrastre.current; const hoja = hojaRef.current;
          if (!inicio || !hoja) return;
          const dy = Math.max(0, event.clientY - inicio.y);
          hoja.style.transform = `translateY(${dy}px)`;
        }}
        onPointerUp={(event) => {
          const inicio = arrastre.current; const hoja = hojaRef.current;
          arrastre.current = null;
          if (!inicio || !hoja) return;
          if (event.clientY - inicio.y > 90) onCerrar();
          else hoja.style.transform = "";
        }}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#cfd8e2]" aria-hidden />
        <p className="sr-only">{t("createTitle")}</p>

        <div className="grid grid-cols-2 gap-3">
          {opciones.map(({ href, titulo, linea, mosaico, Icono }, n) => (
            <Link
              key={href}
              href={href}
              onClick={onCerrar}
              className={`ccr-tarjeta-rol ${opciones.length === 3 && n === 0 ? "col-span-2" : ""} min-w-0 transition-transform active:scale-[0.98]`}
            >
              <span className={`ccr-tarjeta-rol-mosaico ${mosaico}`} style={{ aspectRatio: "auto", height: 96 }} aria-hidden>
                <Icono className={icono} strokeWidth={1.4} />
              </span>
              <span className="mt-3 block truncate whitespace-nowrap text-center text-[15px] font-bold leading-tight text-[#162543]">{titulo}</span>
              {linea && <span className="mt-1 block truncate whitespace-nowrap text-center text-[13px] font-semibold leading-snug text-[#009FD9]">{linea}</span>}
            </Link>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
