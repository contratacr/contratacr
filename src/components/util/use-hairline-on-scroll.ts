"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// La línea que separa un encabezado del contenido responde a UNA pregunta:
// ¿hace falta para ver dónde termina el encabezado?
//
//  • Si debajo hay un lienzo de otro color (el gris del panel, el mapa), en
//    reposo el propio contraste ya separa y la línea sobra; aparece al
//    desplazar, cuando el contenido pasa por debajo.
//  • Si debajo hay el MISMO blanco del encabezado, sin línea no hay división
//    ninguna: ahí se queda siempre.
//
// La decisión se toma midiendo el color real pintado bajo el encabezado, así
// que cada pantalla se resuelve sola y no hay listas de excepciones.
const TRANSPARENTE = /rgba\(0, 0, 0, 0\)|transparent/;

function fondoPintado(desde: Element | null): string | null {
  let nodo: Element | null = desde;
  while (nodo) {
    const fondo = getComputedStyle(nodo).backgroundColor;
    if (fondo && !TRANSPARENTE.test(fondo)) return fondo;
    nodo = nodo.parentElement;
  }
  return null;
}

export function useHairlineOnScroll() {
  const cabeceraRef = useRef<HTMLElement | null>(null);
  const [mismoLienzo, setMismoLienzo] = useState(true);

  // SIN CENTINELA. Había un <div class="h-px"> justo antes de cada encabezado
  // para avisar por IntersectionObserver de que el contenido empezaba a pasar
  // por debajo. Era transparente, así que dejaba ver 1 px del lienzo de la
  // pantalla —gris— POR ENCIMA de la barra blanca: en el teléfono se leía como
  // una raya entre la hora del sistema y el título. Y no servía para nada,
  // porque la línea va siempre y nadie llegó a usar ese aviso.

  const medirLienzo = useCallback(() => {
    const cabecera = cabeceraRef.current;
    if (!cabecera) return;
    const r = cabecera.getBoundingClientRect();
    if (r.height === 0) return;
    const debajo = document.elementFromPoint(Math.round(r.left + 16), Math.round(r.bottom + 4));
    const propio = fondoPintado(cabecera);
    const abajo = fondoPintado(debajo);
    setMismoLienzo(!abajo || !propio || abajo === propio);
  }, []);

  useEffect(() => {
    // Dos cuadros: el primero pinta, el segundo ya puede medir colores.
    const id = requestAnimationFrame(() => requestAnimationFrame(medirLienzo));
    const tarde = window.setTimeout(medirLienzo, 600);
    window.addEventListener("resize", medirLienzo);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(tarde);
      window.removeEventListener("resize", medirLienzo);
    };
  }, [medirLienzo]);

  // LA LÍNEA VA SIEMPRE. La regla de arriba («solo si hace falta») era correcta
  // pantalla por pantalla, pero el app entero se leía desigual: unas barras con
  // línea, otras sin nada hasta desplazar. Una sola regla —línea fina, siempre,
  // el mismo gris, sin sombras— se entiende sin pensarla. La medición de
  // color se conserva por si algún día se vuelve a la regla por pantalla.
  void mismoLienzo;
  return { cabeceraRef, conLinea: true };
}
