"use client";

import { Award, Wrench } from "lucide-react";
import { PanelEmptyState } from "@/components/ui/content-loading";

/**
 * El vacío de una pestaña de la ficha pública (Servicios, Casos de éxito).
 *
 * Vive aparte porque la ficha es una página de servidor y un icono no cruza esa
 * frontera por las props. Antes eran dos líneas de texto gris suelto, las
 * únicas pantallas del app sin el mosaico.
 */
export function FichaVacio({ icono, titulo, descripcion }: { icono: "servicios" | "casos"; titulo: string; descripcion?: string }) {
  return (
    <PanelEmptyState
      plano
      tamano="compacto"
      icon={icono === "servicios" ? Wrench : Award}
      title={titulo}
      description={descripcion}
      className="min-h-[11rem]"
    />
  );
}
