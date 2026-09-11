import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Cabecera de una sección del panel: el subtítulo a la izquierda y la acción
 * principal a la derecha, en la misma fila y SIEMPRE arriba de los filtros
 * (el filtro tiene que quedar pegado a la lista que filtra).
 *
 * Vive en el cuerpo de la sección, no en la cabecera de la tarjeta, para que
 * se vea igual en teléfono, a media pantalla y en escritorio: antes el
 * subtítulo desaparecía y el botón se iba a la izquierda por debajo de 1024px.
 */
export function SectionHeadline({
  subtitulo,
  className,
  children,
}: {
  subtitulo?: string | null;
  className?: string;
  children?: ReactNode;
}) {
  if (!subtitulo && !children) return null;
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4", className)}>
      {subtitulo
        ? <p className="min-w-0 text-sm text-[#6b7280]">{subtitulo}</p>
        // Sin subtítulo el hueco igual tiene que existir: si no, el botón se
        // pega a la izquierda en lugar de quedarse en su esquina.
        : <span aria-hidden className="hidden sm:block" />}
      {children ? <div className="sm:shrink-0">{children}</div> : null}
    </div>
  );
}
