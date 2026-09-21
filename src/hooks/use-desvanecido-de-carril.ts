"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

// El degradado ancho, el que hace de señal cuando no asoma pastilla.
const BORDE_MAX = 30;
// Y el velo fino, cuando la pastilla que asoma ya es señal suficiente.
const BORDE_SUAVE = 10;
// Píxeles de la pastilla que asoma que NUNCA se desvanecen. Es la señal de
// «hay más» en el teléfono —lo que se ve cortado invita a arrastrar—, así que
// el degradado nunca se la come: solo difumina lo que sobra por detrás.
const SOLIDO_MIN = 40;

function asomo(carril: HTMLElement, lado: "izquierda" | "derecha") {
  const caja = carril.getBoundingClientRect();
  // Algunos carriles envuelven las pastillas en una fila: lo que asoma es la
  // pastilla, no la fila entera.
  const fila = carril.children.length === 1 && carril.children[0].children.length > 1
    ? carril.children[0]
    : carril;
  let visible = 0;
  for (const hijo of Array.from(fila.children)) {
    const r = (hijo as HTMLElement).getBoundingClientRect();
    if (r.width <= 0) continue;
    if (lado === "derecha" && r.right > caja.right && r.left < caja.right) visible = Math.max(visible, caja.right - r.left);
    if (lado === "izquierda" && r.left < caja.left && r.right > caja.left) visible = Math.max(visible, r.right - caja.left);
  }
  return visible;
}

// DOS SEÑALES, Y SIEMPRE HAY UNA.
//
// Si asoma media pastilla, esa media pastilla ya dice «hay más» y el degradado
// se aparta: apenas un velo para que el corte no sea una línea dura.
//
// Si asoma un hilito —o nada, porque el corte cayó justo en el hueco entre dos
// pastillas—, el degradado se ABRE y toma el relevo. Antes era al revés: se
// apagaba justo cuando no había pastilla que mostrar, y entonces el carril
// parecía terminar ahí. Es lo que se veía en Casos de éxito, donde asomaban 12
// de 100 px y no había ninguna señal.
function anchoDeBorde(asomado: number) {
  if (asomado >= SOLIDO_MIN) return BORDE_SUAVE;
  return BORDE_MAX;
}

/**
 * Un carril horizontal (filtros, pestañas) se desvanece en el borde por donde
 * hay más contenido, en vez de cortar una pastilla a la mitad contra el filo de
 * la pantalla.
 *
 * Antes el carril se recortaba con `clip-path`: el corte era una línea dura
 * justo en el borde y se leía como un error de dibujo ("los filtros salen
 * cortados"), no como "hay más". Después el degradado se comía justo el trocito
 * de filtro que asomaba, y entonces no se notaba que quedaban filtros a la
 * derecha. Por eso el degradado se MIDE contra lo que asoma: nunca borra los
 * primeros 22 px de la pastilla siguiente, y si lo que asoma es menos que eso,
 * no hay degradado del todo.
 *
 * Devuelve la máscara lista para `mask-image` (o `undefined` cuando todo cabe).
 */
export function useDesvanecidoDeCarril(ref: RefObject<HTMLElement | null>) {
  const [bordes, setBordes] = useState({ izquierda: 0, derecha: 0, hayIzquierda: false, hayDerecha: false });

  const medir = useCallback(() => {
    const carril = ref.current;
    if (!carril) return;
    const maximo = carril.scrollWidth - carril.clientWidth;
    // Con desplazamiento por inercia el final llega a valores fraccionarios:
    // un par de píxeles de holgura o el degradado se queda puesto para siempre.
    const hayIzquierda = carril.scrollLeft > 2;
    const hayDerecha = maximo > 2 && carril.scrollLeft < maximo - 2;
    const siguiente = {
      hayIzquierda,
      hayDerecha,
      izquierda: hayIzquierda ? anchoDeBorde(asomo(carril, "izquierda")) : 0,
      derecha: hayDerecha ? anchoDeBorde(asomo(carril, "derecha")) : 0,
    };
    setBordes((actual) => (
      actual.hayIzquierda === siguiente.hayIzquierda
      && actual.hayDerecha === siguiente.hayDerecha
      && actual.izquierda === siguiente.izquierda
      && actual.derecha === siguiente.derecha
        ? actual
        : siguiente
    ));
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

  const mascara = (bordes.izquierda <= 0 && bordes.derecha <= 0)
    ? undefined
    : `linear-gradient(to right, ${bordes.izquierda > 0 ? `transparent 0, #000 ${bordes.izquierda}px` : "#000 0"}, ${bordes.derecha > 0 ? `#000 calc(100% - ${bordes.derecha}px), transparent 100%` : "#000 100%"})`;

  return { mascara };
}
