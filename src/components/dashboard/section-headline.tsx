import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Cabecera de una sección del panel: el subtítulo a la izquierda y la acción
 * principal a la derecha, en la misma fila y SIEMPRE arriba de los filtros
 * (el filtro tiene que quedar pegado a la lista que filtra).
 *
 * Vive en el cuerpo de la sección, no en la cabecera de la tarjeta, para que el
 * botón de acción se vea igual en teléfono, a media pantalla y en escritorio.
 *
 * EL SUBTÍTULO SOLO SE VE DE 1024px EN ADELANTE. Por debajo, el cuerpo del
 * panel es gris y la sección empieza con su tarjeta: el subtítulo quedaba como
 * una frase suelta flotando sobre el gris, fuera de todo contenedor. Ahí no
 * hace falta, además, porque la cabecera de la pantalla ya dice en qué sección
 * estás. De 1024px en adelante el cuerpo es blanco y la frase queda dentro de
 * la tarjeta, que es donde tiene sentido.
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
    <div className={cn(
      "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
      // Solo subtítulo y nada más: por debajo de 1024px no queda nada que
      // mostrar, así que la fila entera desaparece en vez de dejar su margen
      // como un hueco en blanco.
      !children && "hidden lg:flex",
      className,
    )}>
      {subtitulo
        ? <p className="hidden min-w-0 text-sm text-[#6b7280] lg:block">{subtitulo}</p>
        // Sin subtítulo el hueco igual tiene que existir: si no, el botón se
        // pega a la izquierda en lugar de quedarse en su esquina.
        : null}
      <span aria-hidden className={cn("hidden sm:block", subtitulo && "lg:hidden")} />
      {children ? <div className="sm:shrink-0">{children}</div> : null}
    </div>
  );
}
