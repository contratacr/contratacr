"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

// Alto del velo en el borde por donde sigue la lista.
const BORDE = 44;

/**
 * Una lista vertical que se desplaza por dentro se desvanece en el borde por
 * donde hay más, igual que los carriles horizontales (useDesvanecidoDeCarril).
 * La fila que queda cortada se ve a través del velo: ese corte es la señal de
 * «hay más abajo». Sin él, la lista de categorías de Servicios terminaba en
 * una línea limpia y las últimas parecían no existir.
 *
 * Devuelve la máscara para `mask-image` (o `undefined` cuando todo cabe).
 */
export function useDesvanecidoVertical(ref: RefObject<HTMLElement | null>) {
  const [bordes, setBordes] = useState({ arriba: false, abajo: false });

  const medir = useCallback(() => {
    const lista = ref.current;
    if (!lista) return;
    const maximo = lista.scrollHeight - lista.clientHeight;
    const arriba = lista.scrollTop > 2;
    const abajo = maximo > 2 && lista.scrollTop < maximo - 2;
    setBordes((previo) => (previo.arriba === arriba && previo.abajo === abajo ? previo : { arriba, abajo }));
  }, [ref]);

  useEffect(() => {
    const lista = ref.current;
    if (!lista) return;
    medir();
    lista.addEventListener("scroll", medir, { passive: true });
    const tamano = new ResizeObserver(medir);
    tamano.observe(lista);
    Array.from(lista.children).forEach((hijo) => tamano.observe(hijo));
    const cambios = new MutationObserver(medir);
    cambios.observe(lista, { childList: true, subtree: true });
    window.addEventListener("resize", medir);
    return () => {
      lista.removeEventListener("scroll", medir);
      tamano.disconnect();
      cambios.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [ref, medir]);

  const mascara = !bordes.arriba && !bordes.abajo
    ? undefined
    : `linear-gradient(to bottom, ${bordes.arriba ? `transparent, black ${BORDE}px` : "black"}, ${bordes.abajo ? `black calc(100% - ${BORDE}px), transparent` : "black"})`;
  return { mascara, ...bordes };
}
