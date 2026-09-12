"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useDesvanecidoDeCarril } from "@/hooks/use-desvanecido-de-carril";
import { cn } from "@/lib/utils";

// Un carril horizontal (filtros, pestañas, nombres de sección) que dice "hay
// más" desvaneciéndose en el borde por donde se puede seguir, y solo por ahí.
// La opción activa siempre se trae a la vista.
export function ScrollRail({
  className,
  children,
  "aria-label": ariaLabel,
  role,
}: {
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  role?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mascara = useDesvanecidoDeCarril(ref);

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
    <div className="relative min-w-0">
      <div
        ref={ref}
        role={role}
        aria-label={ariaLabel}
        style={{ maskImage: mascara, WebkitMaskImage: mascara }}
        className={cn("scrollbar-none overflow-x-auto", className)}
      >
        {children}
      </div>
    </div>
  );
}
