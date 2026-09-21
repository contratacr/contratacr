"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bookmark, Flag, Link2, Share2 } from "lucide-react";
import { MenuFicha } from "@/components/ui/menu-ficha";
import { CaraCompartir, useCompartir } from "@/components/ui/boton-compartir";
import { useGuardado } from "@/components/saved/save-item-button";
import { ReportProfileModal } from "@/components/professionals/report-profile-modal";

/**
 * El "..." de la ficha de un proyecto: guardar y compartir. Las dos son
 * acciones sobre la publicación, no formas de contactar, así que viven arriba
 * y juntas; abajo, en su franja, queda solo el WhatsApp.
 *
 * Lleva «reportar» como las fichas de empleo y promoción: una publicación
 * pública necesita una puerta para avisar de algo turbio sin tener que
 * escribirle primero a quien la puso. No sale en la propia.
 */
export function MenuProyecto({
  proyectoId,
  titulo,
  guardar,
  grande = false,
  className,
  clienteNombre,
  esPropio = false,
}: {
  proyectoId: string;
  titulo: string;
  guardar?: { snapshot: Record<string, unknown>; userId: string | null };
  grande?: boolean;
  className?: string;
  /** A quién se reporta, cuando se reporta. */
  clienteNombre?: string;
  /** El proyecto es de quien mira: no se reporta a sí mismo. */
  esPropio?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("menuFicha");
  const { avisoNodo, compartir } = useCompartir();
  const [reportando, setReportando] = useState(false);
  const guardado = useGuardado({
    itemType: "project",
    itemId: proyectoId,
    snapshot: guardar?.snapshot ?? {},
    userId: guardar?.userId ?? null,
    loginRedirect: `/proyectos/${proyectoId}`,
  });
  const enlace = typeof window === "undefined"
    ? `/${locale}/proyectos/${proyectoId}`
    : `${window.location.origin}/${locale}/proyectos/${proyectoId}`;

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
          ...(esPropio ? [] : [{ id: "reportar", icono: <Flag className="h-4 w-4" />, texto: t("reportProject"), peligro: true, onSelect: () => setReportando(true) }]),
        ];

  return (
    <>
      <MenuFicha
        className={className}
        grande={grande}
        opciones={OPCIONES_MENU}
      />
      {avisoNodo}
      {reportando && (
        <ReportProfileModal
          professionalName={clienteNombre || titulo}
          // Un proyecto no tiene perfil: lo que viaja es su dirección, para que
          // la cola de moderación sepa exactamente qué publicación revisar.
          professionalSlug={`proyecto-${proyectoId}`}
          contexto={`Proyecto "${titulo}" (${proyectoId})`}
          titulo={t("reportProject")}
          onClose={() => setReportando(false)}
        />
      )}
    </>
  );
}
