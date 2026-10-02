"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
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
export function ServiciosPorSeccion({ secciones, verTodos }: { secciones: SeccionDeServicios[]; verTodos?: { href: string; label: string } }) {
  const [activa, setActiva] = useState(0);
  // El servicio tocado se queda agrandado hasta que la página nueva reemplaza a esta.
  const [tocado, setTocado] = useState<string | null>(null);
  const fila = useRef<HTMLDivElement | null>(null);
  const seccion = secciones[activa] ?? secciones[0];
  if (!seccion) return null;

  // Flecha «›» a la derecha cuando las pestañas no caben (como Thumbtack).
  const [hayMas, setHayMas] = useState(false);
  useEffect(() => {
    const f = fila.current;
    if (!f) return;
    const medir = () => setHayMas(f.scrollLeft + f.clientWidth < f.scrollWidth - 4);
    medir();
    f.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    return () => { f.removeEventListener("scroll", medir); window.removeEventListener("resize", medir); };
  }, []);

  const elegir = (indice: number, boton: HTMLButtonElement) => {
    setActiva(indice);
    // La pestaña elegida queda a la vista aunque la fila se desplace.
    boton.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  };

  return (
    <div>
      <div className="relative">
      <div
        ref={fila}
        role="tablist"
        aria-label={seccion.label}
        className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain border-b border-[#e3e9ef] px-4 sm:mx-0 sm:px-0 lg:grid lg:grid-flow-col lg:auto-cols-fr lg:gap-0"
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
                "relative flex min-w-[84px] shrink-0 flex-col items-center gap-1.5 px-3 pb-3 pt-1 text-[14px] font-semibold transition-colors sm:min-w-[96px] sm:text-[15px] lg:min-w-[120px] lg:gap-2.5 lg:px-5 lg:pb-4 lg:text-[17px] lg:font-medium",
                elegida ? "text-[#009FD9]" : "text-[#6b7686] hover:text-[#162543]",
              )}
            >
              <Icon className="h-6 w-6 lg:h-7 lg:w-7" strokeWidth={1.6} aria-hidden />
              <span className="whitespace-nowrap">{s.label}</span>
              <span
                aria-hidden
                className={cn("absolute inset-x-2 bottom-0 h-[3px] rounded-full transition-opacity", elegida ? "bg-[#009FD9] opacity-100" : "opacity-0")}
              />
            </button>
          );
        })}
      </div>
      {hayMas && (
        <button
          type="button"
          aria-label="Más secciones"
          onClick={() => fila.current?.scrollBy({ left: fila.current.clientWidth * 0.7, behavior: "smooth" })}
          className="absolute right-0 top-1/2 hidden h-11 w-11 -translate-y-[60%] place-items-center rounded-full bg-white text-[#162543] shadow-[0_4px_16px_rgba(15,23,42,0.18)] transition hover:scale-105 lg:grid"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
      </div>

      {/* Los cuatro más buscados de la sección: 2×2 en el teléfono (como
          Thumbtack), una fila de cuatro desde computadora. */}
      <div
        id="servicios-de-la-seccion"
        role="tabpanel"
        key={seccion.id}
        className="ccr-entrada mt-4 grid grid-cols-2 gap-3 sm:mt-7 sm:gap-4 lg:grid-cols-4"
      >
        {seccion.servicios.slice(0, 4).map((servicio) => (
          <Link
            key={servicio.id}
            href={servicio.href}
            onClick={() => setTocado(servicio.id)}
            data-tocado={tocado === servicio.id || undefined}
            className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-[#e8eef3] shadow-[0_6px_18px_-12px_rgba(15,23,42,0.45)] lg:aspect-[4/5.2]"
          >
            <ServiceImage categoryId={servicio.id} badge={false} className="pointer-events-none absolute inset-0 h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.06] group-active:scale-[1.06] group-data-[tocado]:scale-[1.06]" />
            <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.12) 55%, transparent 100%)" }} />
            <span className="absolute inset-x-0 bottom-0 p-3.5 text-[15px] font-bold leading-tight text-white drop-shadow sm:p-4 sm:text-base lg:p-6 lg:text-2xl">
              {servicio.label}
            </span>
          </Link>
        ))}
      </div>
      {verTodos && (
        <div className="mt-5 text-center">
          <Link href={verTodos.href} className="text-[14px] font-bold text-[#009FD9] hover:underline">{verTodos.label}</Link>
        </div>
      )}
    </div>
  );
}
