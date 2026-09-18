"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDesvanecidoDeCarril } from "@/hooks/use-desvanecido-de-carril";
import { useArrastreHorizontal } from "@/hooks/use-arrastre-horizontal";
import { cn } from "@/lib/utils";

// Un carril horizontal (filtros, pestañas, nombres de sección) que dice "hay
// más" dejando asomar el siguiente filtro y desvaneciéndolo apenas en el borde
// por donde se puede seguir. La opción activa siempre se trae a la vista.
export function ScrollRail({
  className,
  children,
  "aria-label": ariaLabel,
  role,
  conFlechas = false,
}: {
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  role?: string;
  /**
   * Flechas en computadora, para cuando el carril sea la única forma de llegar
   * a lo que asoma. Apagadas por defecto: con el dedo el carril se arrastra
   * solo, y en una tarjeta que ya tiene sus botones, dos más para mover una
   * fila de texto pesan más de lo que ayudan.
   */
  conFlechas?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { mascara } = useDesvanecidoDeCarril(ref);
  useArrastreHorizontal(ref);
  const [puede, setPuede] = useState({ izquierda: false, derecha: false });

  const medir = useCallback(() => {
    const rail = ref.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setPuede({ izquierda: rail.scrollLeft > 2, derecha: rail.scrollLeft < max - 2 });
  }, []);

  useEffect(() => {
    if (!conFlechas) return;
    const rail = ref.current;
    if (!rail) return;
    medir();
    rail.addEventListener("scroll", medir, { passive: true });
    const observador = new ResizeObserver(medir);
    observador.observe(rail);
    return () => {
      rail.removeEventListener("scroll", medir);
      observador.disconnect();
    };
  }, [conFlechas, medir]);

  const desplazar = (lado: "izquierda" | "derecha") => {
    const rail = ref.current;
    if (!rail) return;
    const paso = Math.max(160, rail.clientWidth * 0.7);
    rail.scrollBy({ left: lado === "derecha" ? paso : -paso, behavior: "smooth" });
  };

  // La opción activa nunca puede quedar cortada en el borde: al cambiar, el
  // rail la trae a la vista. Sin esto, con cuatro etapas la seleccionada se veía
  // a medias contra el filo de la pantalla.
  useEffect(() => {
    const rail = ref.current;
    if (!rail) return;
    const traer = () => {
      const activa = rail.querySelector<HTMLElement>('[aria-selected="true"], [data-active="true"], [aria-pressed="true"]');
      if (!activa) return;
      const r = activa.getBoundingClientRect();
      const c = rail.getBoundingClientRect();
      if (r.left < c.left + 4 || r.right > c.right - 4) {
        rail.scrollTo({ left: rail.scrollLeft + (r.left - c.left) - (c.width - r.width) / 2, behavior: "smooth" });
      }
    };
    traer();
    const observador = new MutationObserver(traer);
    observador.observe(rail, { attributes: true, subtree: true, attributeFilter: ["aria-selected", "data-active", "aria-pressed"] });
    return () => observador.disconnect();
  }, []);

  return (
    // Con flechas, el carril se mete hacia adentro en computadora para que las
    // flechas vivan en su propio margen y no queden encima del contenido.
    <div className={cn("relative min-w-0", conFlechas && "lg:px-7")}>
      <div
        ref={ref}
        role={role}
        aria-label={ariaLabel}
        style={{ maskImage: mascara, WebkitMaskImage: mascara }}
        className={cn("ccr-carril scrollbar-none overflow-x-auto", className)}
      >
        {children}
      </div>
      {conFlechas && puede.izquierda && (
        <button
          type="button"
          aria-label="Anterior"
          onClick={(e) => { e.stopPropagation(); desplazar("izquierda"); }}
          className="absolute left-0 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-[#dbe4ec] bg-white text-[#162543] shadow-sm transition-colors hover:bg-[#eef5f9] lg:grid"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {conFlechas && puede.derecha && (
        <button
          type="button"
          aria-label="Siguiente"
          onClick={(e) => { e.stopPropagation(); desplazar("derecha"); }}
          className="absolute right-0 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-[#dbe4ec] bg-white text-[#162543] shadow-sm transition-colors hover:bg-[#eef5f9] lg:grid"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
