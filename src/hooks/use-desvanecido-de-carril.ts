"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

const BORDE = 28;

/**
 * Un carril horizontal (filtros, pestañas) se desvanece en el borde por donde
 * hay más contenido, en vez de cortar una pastilla a la mitad contra el filo de
 * la pantalla.
 *
 * Antes el carril se recortaba con `clip-path` para dejar la siguiente pastilla
 * asomando a medias: el corte era una línea dura justo en el borde y se leía
 * como un error de dibujo ("los filtros salen cortados"), no como "hay más".
 * Un degradado dice lo mismo sin romper nada, es lo que usan las apps que
 * tenemos de referencia, y solo aparece del lado que de verdad puede seguir.
 *
 * Devuelve el valor listo para `mask-image` (y `-webkit-mask-image`), o
 * `undefined` cuando todo cabe y no hay nada que insinuar.
 */
export function useDesvanecidoDeCarril(ref: RefObject<HTMLElement | null>) {
  const [bordes, setBordes] = useState({ izquierda: false, derecha: false });

  const medir = useCallback(() => {
    const carril = ref.current;
    if (!carril) return;
    const maximo = carril.scrollWidth - carril.clientWidth;
    // Con desplazamiento por inercia el final llega a valores fraccionarios:
    // un par de píxeles de holgura o el degradado se queda puesto para siempre.
    const siguiente = { izquierda: carril.scrollLeft > 2, derecha: maximo > 2 && carril.scrollLeft < maximo - 2 };
    setBordes((actual) => (actual.izquierda === siguiente.izquierda && actual.derecha === siguiente.derecha ? actual : siguiente));
  }, [ref]);

  useEffect(() => {
    const carril = ref.current;
    if (!carril) return;
    medir();
    carril.addEventListener("scroll", medir, { passive: true });
    const observador = new ResizeObserver(medir);
    observador.observe(carril);
    for (const hijo of Array.from(carril.children)) observador.observe(hijo);
    return () => {
      carril.removeEventListener("scroll", medir);
      observador.disconnect();
    };
  }, [medir, ref]);

  if (!bordes.izquierda && !bordes.derecha) return undefined;
  const inicio = bordes.izquierda ? `transparent 0, #000 ${BORDE}px` : "#000 0";
  const final = bordes.derecha ? `#000 calc(100% - ${BORDE}px), transparent 100%` : "#000 100%";
  return `linear-gradient(to right, ${inicio}, ${final})`;
}
