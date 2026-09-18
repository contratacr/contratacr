"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bookmark, Flag, Link2, Share2 } from "lucide-react";
import { MenuFicha } from "@/components/ui/menu-ficha";
import { useCompartir } from "@/components/ui/boton-compartir";
import { ReportProfileModal } from "@/components/professionals/report-profile-modal";
import { useGuardado } from "@/components/saved/save-item-button";
import { useNativeShare } from "@/hooks/use-native-share";

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
  const { avisoNodo, compartir, copiar } = useCompartir();
  const nativo = useNativeShare();
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

  // Como LinkedIn: en el TELÉFONO, la hoja del sistema —con los contactos de
  // WhatsApp, Mensajes, AirDrop—; en la COMPUTADORA, donde esa hoja no existe,
  // copiar el enlace y avisarlo. Antes la computadora abría una ventana con
  // WhatsApp, Instagram, Facebook y correo para terminar haciendo lo mismo:
  // pegar un enlace en otro lado.
  const abrirCompartir = () => {
    if (nativo) { void compartir(enlace, titulo); return; }
    void copiar(enlace);
  };

  const OPCIONES_MENU = [
          ...(guardar ? [{
            id: "guardar",
            icono: <Bookmark className={`h-4 w-4 ${guardado.guardado ? "fill-current text-[#0089bb]" : ""}`} />,
            texto: guardado.etiqueta,
            onSelect: () => void guardado.alternar(),
          }] : []),
          { id: "compartir", icono: nativo ? <Share2 className="h-4 w-4" /> : <Link2 className="h-4 w-4" />, texto: nativo ? t("share") : t("copyLink"), onSelect: abrirCompartir },
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
