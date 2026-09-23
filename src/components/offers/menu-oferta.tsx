"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bookmark, Flag, Link2, Share2 } from "lucide-react";
import { MenuFicha } from "@/components/ui/menu-ficha";
import { CaraCompartir, useCompartir } from "@/components/ui/boton-compartir";
import { ReportProfileModal } from "@/components/professionals/report-profile-modal";
import { useGuardado } from "@/components/saved/save-item-button";

/**
 * El "..." de la página de una oferta: compartir y reportar. Copiar el enlace
 * no va aquí: la hoja de compartir ya lo trae, y era la misma acción dos veces.
 * Vive aparte porque la página es de servidor y esto necesita ser del cliente.
 */
export function MenuOferta({
  ofertaId,
  titulo,
  enlace,
  profesionalNombre,
  profesionalSlug,
  esPropia = false,
  grande = false,
  className,
  guardar,
}: {
  ofertaId: string;
  titulo: string;
  enlace: string;
  profesionalNombre: string;
  profesionalSlug?: string | null;
  esPropia?: boolean;
  grande?: boolean;
  className?: string;
  /** Guardar la promoción, como primera opción del menú. */
  guardar?: { itemId: string; snapshot: Record<string, unknown>; userId: string | null; loginRedirect: string };
}) {
  const t = useTranslations("menuFicha");
  const { avisoNodo, compartir } = useCompartir();
  const [reportando, setReportando] = useState(false);
  // Guardar vive DENTRO del «...», no al lado: es una acción sobre la ficha,
  // del mismo rango que compartir, y suelta en la barra le robaba sitio al
  // título. Abajo queda solo lo que contacta.
  const guardado = useGuardado({
    itemType: "offer",
    itemId: guardar?.itemId ?? ofertaId,
    snapshot: guardar?.snapshot ?? {},
    userId: guardar?.userId ?? null,
    loginRedirect: guardar?.loginRedirect,
  });

  // Como LinkedIn: con el DEDO, la hoja del sistema —WhatsApp, Mensajes,
  // AirDrop—; con el RATÓN, copiar el enlace y avisarlo. Lo decide `compartir`,
  // con la misma pregunta que el CSS usa para elegir el rótulo.
  const abrirCompartir = () => void compartir(enlace, titulo);

  const OPCIONES_MENU = [
          ...(guardar ? [{
            id: "guardar",
            icono: <Bookmark className={`h-4 w-4 ${guardado.guardado ? "fill-current text-[#0089bb]" : ""}`} />,
            texto: guardado.etiqueta,
            onSelect: () => void guardado.alternar(),
          }] : []),
          // Las dos caras se pintan SIEMPRE y elige el CSS, igual que en
          // `BotonCompartir`: Chrome en macOS trae `navigator.share`, así que
          // mirándolo el menú decía «Compartir» en la computadora.
          {
            id: "compartir",
            icono: <CaraCompartir dedo={<Share2 className="h-4 w-4" />} raton={<Link2 className="h-4 w-4" />} />,
            texto: <CaraCompartir dedo={t("share")} raton={t("copyLink")} />,
            etiqueta: t("share"),
            onSelect: abrirCompartir,
          },
          ...(esPropia || !profesionalSlug ? [] : [{ id: "reportar", icono: <Flag className="h-4 w-4" />, texto: t("reportOffer"), peligro: true, onSelect: () => setReportando(true) }]),
        ];

  return (
    <>
      <MenuFicha
        className={className}
        grande={grande}
        opciones={OPCIONES_MENU}
      />
      {reportando && profesionalSlug && (
        <ReportProfileModal
          professionalName={profesionalNombre}
          professionalSlug={profesionalSlug}
          contexto={`Promoción "${titulo}" (${ofertaId})`}
          titulo={t("reportOffer")}
          onClose={() => setReportando(false)}
        />
      )}
      {avisoNodo}
    </>
  );
}
