"use client";

import { useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ServiceImage } from "@/components/professionals/service-image";
import { getCategoryGroupVisual } from "@/lib/data/category-group-visuals";
import { cn } from "@/lib/utils";

export type SeccionDeServicios = {
  id: string;
  label: string;
  servicios: { id: string; label: string; href: string }[];
};

// SERVICIOS POR SECCIÓN, como Thumbtack: una fila de pestañas con el ícono de
// cada sección (Hogar, Tecnología, Salud…) y debajo los servicios MÁS BUSCADOS
// de esa sección, con foto. Antes era un carrusel que pasaba solo: quien
// buscaba algo de salud tenía que esperar a que apareciera. Aquí va directo.
// Los cuatro más buscados de cada sección: 2×2 en el teléfono, una fila en computadora.
export function ServiciosPorSeccion({ secciones }: { secciones: SeccionDeServicios[] }) {
  const [activa, setActiva] = useState(0);
  const fila = useRef<HTMLDivElement | null>(null);
  const seccion = secciones[activa] ?? secciones[0];
  if (!seccion) return null;

  const elegir = (indice: number, boton: HTMLButtonElement) => {
    setActiva(indice);
    // La pestaña elegida queda a la vista aunque la fila se desplace.
    boton.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  };

  return (
    <div>
      <div
        ref={fila}
        role="tablist"
        aria-label={seccion.label}
        className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b border-[#e3e9ef] px-4 sm:mx-0 sm:justify-center sm:px-0"
      >
        {secciones.map((s, indice) => {
          const { Icon } = getCategoryGroupVisual(s.id);
          const elegida = indice === activa;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={elegida}
              aria-controls="servicios-de-la-seccion"
              onClick={(event) => elegir(indice, event.currentTarget)}
              className={cn(
                "relative flex min-w-[84px] shrink-0 flex-col items-center gap-1.5 px-3 pb-3 pt-1 text-[14px] font-semibold transition-colors sm:min-w-[96px] sm:text-[15px]",
                elegida ? "text-[#009FD9]" : "text-[#6b7686] hover:text-[#162543]",
              )}
            >
              <Icon className="h-6 w-6" strokeWidth={1.7} aria-hidden />
              <span className="whitespace-nowrap">{s.label}</span>
              <span
                aria-hidden
                className={cn("absolute inset-x-2 -bottom-px h-[3px] rounded-full transition-opacity", elegida ? "bg-[#009FD9] opacity-100" : "opacity-0")}
              />
            </button>
          );
        })}
      </div>

      {/* Los cuatro más buscados de la sección: 2×2 en el teléfono (como
          Thumbtack), una fila de cuatro desde computadora. */}
      <div
        id="servicios-de-la-seccion"
        role="tabpanel"
        key={seccion.id}
        className="ccr-entrada mt-5 grid grid-cols-2 gap-3 sm:mt-7 sm:gap-4 lg:grid-cols-4"
      >
        {seccion.servicios.slice(0, 4).map((servicio) => (
          <Link
            key={servicio.id}
            href={servicio.href}
            className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-[#e8eef3] shadow-[0_6px_18px_-12px_rgba(15,23,42,0.45)] lg:aspect-[4/3.4]"
          >
            <ServiceImage categoryId={servicio.id} badge={false} className="pointer-events-none absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.04]" />
            <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.12) 55%, transparent 100%)" }} />
            <span className="absolute inset-x-0 bottom-0 p-3.5 text-[15px] font-bold leading-tight text-white drop-shadow sm:p-4 sm:text-base">
              {servicio.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
