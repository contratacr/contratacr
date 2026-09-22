"use client";

import { Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PanelEmptyState } from "@/components/ui/content-loading";

/**
 * El vacío de /buscar, con el MISMO dibujo que el resto del app.
 *
 * Existe como componente de cliente porque `/buscar` es una página de servidor
 * y un icono no se puede pasar por las props a través de esa frontera; antes
 * por eso el vacío estaba copiado a mano y se había quedado con un mosaico de
 * 80px que empujaba el botón fuera de la pantalla.
 */
export function SearchEmptyState({ title, description, cta, href, limpiar }: { title: string; description: string; cta: string; href: string; limpiar?: { etiqueta: string; href: string } }) {
  return (
    // EN COMPUTADORA LLENA LA COLUMNA. El mapa de al lado mide
    // `calc(100vh-104px)`; la tarjeta del vacío medía 20rem y debajo quedaba
    // media pantalla gris, como si la página se hubiera cortado. Con la misma
    // altura del mapa, el vacío se lee como una sección entera y el contenido
    // queda centrado en ella.
    <div data-search-empty-state className="-mx-4 flex w-[calc(100%+2rem)] flex-col bg-white lg:mx-0 lg:min-h-[calc(100vh-104px)] lg:w-full lg:rounded-2xl lg:border lg:border-[#e5e7eb] lg:shadow-sm">
      <PanelEmptyState
        plano
        icon={Search}
        title={title}
        description={description}
        className="flex-1 lg:min-h-[20rem] lg:px-8 lg:py-12"
        action={(
          // PRIMERO LA SALIDA BARATA. Si hay filtros puestos, lo más probable
          // es que sobre uno: quitarlos devuelve resultados al instante.
          // Publicar lo que se necesita es la otra salida, y sigue siendo la
          // principal cuando no hay nada que quitar.
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
            <Link
              href={href}
              className="inline-flex items-center justify-center rounded-full bg-[#009FD9] px-6 text-sm font-bold text-white whitespace-nowrap transition-colors hover:bg-[#0089bb]"
            >
              {cta}
            </Link>
            {limpiar && (
              <Link
                href={limpiar.href}
                className="inline-flex items-center justify-center rounded-full border border-[#b9d9e8] px-6 py-2.5 text-sm font-bold text-[#007fae] whitespace-nowrap transition-colors hover:bg-[#f1f9fc]"
              >
                {limpiar.etiqueta}
              </Link>
            )}
          </div>
        )}
      />
    </div>
  );
}
