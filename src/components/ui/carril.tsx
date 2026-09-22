"use client";

import { useRef, type ReactNode } from "react";
import { useDesvanecidoDeCarril } from "@/hooks/use-desvanecido-de-carril";

/**
 * Una fila que se desplaza a lo ancho Y LO DICE.
 *
 * `ScrollRail` es el carril completo —degradado, flechas, arrastre y asomo
 * mínimo— y es el que conviene cuando la fila es un filtro con su propio
 * margen. Pero medio app tiene filas escritas a mano con `overflow-x-auto` y
 * nada más: las pestañas de la portada, los grupos de /servicios, las
 * provincias, los próximos días al reservar, las miniaturas de un caso. Ahí
 * meter el carril entero cambiaría la caja; esto solo añade lo que falta.
 *
 * El degradado se MIDE antes de pintarse: si todo cabe, no sale; si se llega
 * al final, se va. Nunca promete algo que no hay.
 */
export function Carril({
  className,
  children,
  role,
  ariaLabel,
}: {
  className?: string;
  children: ReactNode;
  role?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { mascara } = useDesvanecidoDeCarril(ref);
  return (
    <div
      ref={ref}
      role={role}
      aria-label={ariaLabel}
      style={{ maskImage: mascara, WebkitMaskImage: mascara }}
      data-ccr-degradado={mascara ? "" : undefined}
      className={className}
    >
      {children}
    </div>
  );
}
