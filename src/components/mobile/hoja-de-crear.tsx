"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Briefcase, ClipboardList, ImagePlus, UserRound, Wrench } from "lucide-react";
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
export function HojaDeCrear({ abierta, onCerrar, esProfesional, avatarUrl }: { abierta: boolean; onCerrar: () => void; esProfesional: boolean; avatarUrl?: string | null }) {
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

  // COMO EL «CREAR» DE FACEBOOK: arriba una tarjeta ancha con la foto de la
  // cuenta y lo que más se publica; debajo, cuadros iguales con lo demás.
  // Profesional: arriba su caso de éxito (su «publicación»); abajo proyecto,
  // promoción y empleo. Cliente: arriba su proyecto; abajo ofrecer servicios.
  const principal = esProfesional
    ? { href: "/dashboard/profesional?tab=photos&nuevo=1", titulo: t("createCase"), texto: t("createCaseDesc"), icono: <ImagePlus className="h-6 w-6 text-[#16a34a]" /> }
    : { href: "/publicar-proyecto", titulo: t("createProject"), texto: t("createProjectAsk"), icono: <ClipboardList className="h-6 w-6 text-[#009FD9]" /> };
  const cuadros = esProfesional
    ? [
        { href: "/publicar-proyecto", titulo: t("tileProject"), fondo: "from-[#33b8ea] to-[#0089c2]", icono: <ClipboardList className="h-6 w-6" /> },
        { href: "/promociones/publicar", titulo: t("tileDeal"), fondo: "from-[#2d4a7c] to-[#162543]", icono: <OfferTagPercentIcon className="h-6 w-6" /> },
        ...(EMPLEOS_VISIBLE ? [{ href: "/empleos/publicar", titulo: t("tileJob"), fondo: "from-[#5ccdf2] to-[#1aa6d8]", icono: <Briefcase className="h-6 w-6" /> }] : []),
      ]
    : [
        { href: "/registro/profesional", titulo: t("createOffer"), fondo: "from-[#2d4a7c] to-[#162543]", icono: <Wrench className="h-6 w-6" /> },
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

        <Link href={principal.href} onClick={onCerrar} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-[0_8px_22px_-16px_rgba(15,23,42,0.45)] ring-1 ring-[#e8eef4] transition-transform active:scale-[0.99]">
          {avatarUrl
            // eslint-disable-next-line @next/next/no-img-element -- avatar pequeño de tamaño fijo
            ? <img src={avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-[#e2e8f0]" />
            : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#eef6fb] ring-1 ring-[#e2e8f0]"><UserRound className="h-6 w-6 text-[#526277]" /></span>}
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-bold text-[#162543]">{principal.titulo}</span>
            <span className="mt-0.5 block truncate text-[14px] text-[#64748b]">{principal.texto}</span>
          </span>
          <span className="shrink-0">{principal.icono}</span>
        </Link>

        {/* Una sola opción debajo (cliente) va en fila, como la de arriba: un
            cuadro solo a todo lo ancho quedaba enorme y vacío. */}
        {cuadros.length === 1 ? (
          <Link href={cuadros[0].href} onClick={onCerrar} className="mt-3 flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-[0_8px_22px_-16px_rgba(15,23,42,0.45)] ring-1 ring-[#e8eef4] transition-transform active:scale-[0.99]">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br text-white ${cuadros[0].fondo}`}>{cuadros[0].icono}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-bold text-[#162543]">{cuadros[0].titulo}</span>
              <span className="mt-0.5 block truncate text-[14px] text-[#64748b]">{t("createOfferDesc")}</span>
            </span>
          </Link>
        ) : (
        <div className={`mt-3 grid gap-3 ${cuadros.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {cuadros.map((cuadro) => (
            <Link key={cuadro.href} href={cuadro.href} onClick={onCerrar} className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white px-2 py-4 text-center shadow-[0_8px_22px_-16px_rgba(15,23,42,0.45)] ring-1 ring-[#e8eef4] transition-transform active:scale-[0.97]">
              <span className={`grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br text-white ${cuadro.fondo}`}>{cuadro.icono}</span>
              <span className="text-[15px] font-bold text-[#162543]">{cuadro.titulo}</span>
            </Link>
          ))}
        </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
