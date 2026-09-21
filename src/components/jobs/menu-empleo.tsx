"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bookmark, Flag, Link2, Share2 } from "lucide-react";
import { MenuFicha } from "@/components/ui/menu-ficha";
import { CaraCompartir, useCompartir } from "@/components/ui/boton-compartir";
import { ReportProfileModal } from "@/components/professionals/report-profile-modal";
import { useGuardado } from "@/components/saved/save-item-button";

/**
 * El "..." de un empleo: compartir y reportar (copiar el enlace ya vive dentro
 * de la hoja de compartir). Vive en la
 * cabecera cuando la pantalla tiene una (el teléfono) y arriba de la ficha
 * cuando no la hay.
 */
export function MenuEmpleo({
  empleoId,
  titulo,
  enlace,
  empleadorNombre,
  empleadorSlug,
  esPropio = false,
  grande = false,
  className,
  guardar,
}: {
  empleoId: string;
  titulo: string;
  enlace: string;
  empleadorNombre: string;
  empleadorSlug?: string | null;
  esPropio?: boolean;
  grande?: boolean;
  className?: string;
  /** Guardar el empleo, como primera opción del menú. */
  guardar?: { snapshot: Record<string, unknown>; userId: string | null };
}) {
  const t = useTranslations("menuFicha");
  const { avisoNodo, compartir } = useCompartir();
  const [reportando, setReportando] = useState(false);
  // Guardar vive DENTRO del «...», junto a compartir: las dos son acciones
  // sobre la publicación. Abajo queda solo lo que contacta.
  const guardado = useGuardado({
    itemType: "job",
    itemId: empleoId,
    snapshot: guardar?.snapshot ?? {},
    userId: guardar?.userId ?? null,
    loginRedirect: `/empleos/${empleoId}`,
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
          ...(esPropio || !empleadorSlug ? [] : [{ id: "reportar", icono: <Flag className="h-4 w-4" />, texto: t("reportJob"), peligro: true, onSelect: () => setReportando(true) }]),
        ];

  return (
    <>
      <MenuFicha
        className={className}
        grande={grande}
        opciones={OPCIONES_MENU}
      />
      {reportando && empleadorSlug && (
        <ReportProfileModal
          professionalName={empleadorNombre}
          professionalSlug={empleadorSlug}
          contexto={`Empleo "${titulo}" (${empleoId})`}
          titulo={t("reportJob")}
          onClose={() => setReportando(false)}
        />
      )}
      {avisoNodo}
    </>
  );
}
