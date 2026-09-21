"use client";

import { FlechasDeCarril } from "@/components/ui/flechas-de-carril";
import { useEffect, useRef, type ReactNode } from "react";
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
  asomoMinimo = 0,
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
  /**
   * Cuánto tiene que verse, como mínimo, de la opción que queda cortada a la
   * derecha. Si asoma menos, las anteriores ceden relleno (hasta 5 px por lado)
   * mediante --ccr-ajuste-carril, que las celdas restan de su padding. Con un
   * asomo de 6 px nadie notaba que había más opciones.
   */
  asomoMinimo?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { mascara } = useDesvanecidoDeCarril(ref);
  useArrastreHorizontal(ref);
  // Lo que asoma por el borde tiene que NOTARSE: si la opción cortada se ve
  // menos que `asomoMinimo`, se aprieta un poco el espaciado para que asome
  // más. Sin esto la última opción se veía como un hilito contra el filo.
  useEffect(() => {
    const rail = ref.current;
    if (!rail || asomoMinimo <= 0) return;
    const ajustar = () => {
      if (rail.scrollLeft > 2) return;
      rail.style.setProperty("--ccr-ajuste-carril", "0px");
      const caja = rail.getBoundingClientRect();
      const hijos = Array.from(rail.children) as HTMLElement[];
      const cortado = hijos.findIndex((h) => { const r = h.getBoundingClientRect(); return r.left < caja.right - 1 && r.right > caja.right + 1; });
      if (cortado <= 0) return;
      const asomo = caja.right - hijos[cortado].getBoundingClientRect().left;
      if (asomo >= asomoMinimo) return;
      const ajuste = Math.min(5, Math.ceil((asomoMinimo - asomo) / (2 * cortado)));
      rail.style.setProperty("--ccr-ajuste-carril", `${ajuste}px`);
    };
    ajustar();
    const observador = new ResizeObserver(ajustar);
    observador.observe(rail);
    return () => observador.disconnect();
  }, [asomoMinimo, children]);

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
    <div className={cn("group/carril relative min-w-0", conFlechas && "lg:px-7")}>
      <div
        ref={ref}
        role={role}
        aria-label={ariaLabel}
        style={{ maskImage: mascara, WebkitMaskImage: mascara }}
        className={cn("ccr-carril scrollbar-none overflow-x-auto", className)}
      >
        {children}
      </div>
      <FlechasDeCarril carril={ref} enMargen={conFlechas} />
    </div>
  );
}
