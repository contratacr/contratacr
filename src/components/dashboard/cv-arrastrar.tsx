"use client";

import { useState, type PointerEvent as EventoPuntero } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ARRASTRAR PARA ORDENAR (20-nov-2026), como en FlowCV, con el mouse o un
 * lápiz. La manija solo se ve con puntero fino (computadora): en el teléfono
 * siguen las flechas y el menú «···», que además son la opción con teclado.
 *
 * Uso: `const a = useArrastrar(total, mover)`; el contenedor lleva `{...a.lista}`,
 * cada elemento `{...a.elemento(i)}` y adentro `<Manija {...a.manija(i)} />`.
 */
export function useArrastrar(total: number, mover: (desde: number, hasta: number) => void) {
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [destino, setDestino] = useState<number | null>(null);

  // Los elementos se buscan desde la manija: los de su misma lista.
  const indiceEn = (desde: HTMLElement, y: number) => {
    const lista = desde.closest("[data-arrastre-lista]");
    const items = [...(lista?.querySelectorAll<HTMLElement>(":scope > [data-arrastre]") ?? [])];
    for (let i = 0; i < items.length; i += 1) {
      const r = items[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return Math.max(items.length - 1, 0);
  };

  const manija = (i: number) => ({
    onPointerDown: (e: EventoPuntero<HTMLButtonElement>) => {
      if (e.pointerType === "touch" || total < 2) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setArrastrando(i); setDestino(i);
    },
    onPointerMove: (e: EventoPuntero<HTMLButtonElement>) => {
      if (arrastrando === null) return;
      setDestino(indiceEn(e.currentTarget, e.clientY));
    },
    onPointerUp: () => {
      if (arrastrando !== null && destino !== null && destino !== arrastrando) mover(arrastrando, destino);
      setArrastrando(null); setDestino(null);
    },
    onPointerCancel: () => { setArrastrando(null); setDestino(null); },
  });

  const elemento = (i: number) => ({
    "data-arrastre": "",
    className: cn(
      arrastrando === i && "opacity-60",
      destino === i && arrastrando !== null && arrastrando !== i && (destino > arrastrando
        ? "relative after:absolute after:inset-x-1 after:-bottom-[5px] after:h-[3px] after:rounded-full after:bg-[#009FD9]"
        : "relative before:absolute before:inset-x-1 before:-top-[5px] before:h-[3px] before:rounded-full before:bg-[#009FD9]"),
    ),
  });

  return { lista: { "data-arrastre-lista": "" }, manija, elemento, arrastrando };
}

/** Mueve un elemento de una lista de `desde` a `hasta`. */
export function moverEnLista<T>(lista: T[], desde: number, hasta: number): T[] {
  const nueva = [...lista];
  const [x] = nueva.splice(desde, 1);
  nueva.splice(hasta, 0, x);
  return nueva;
}

export function Manija({ etiqueta, ...eventos }: { etiqueta: string } & ReturnType<ReturnType<typeof useArrastrar>["manija"]>) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      title={etiqueta}
      {...eventos}
      className="hidden h-9 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-[#98a2b3] hover:bg-[#eef3f7] hover:text-[#52627a] active:cursor-grabbing [@media(pointer:fine)]:grid"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}
