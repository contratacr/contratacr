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
  const sentinelaRef = useRef<HTMLDivElement | null>(null);
  const cabeceraRef = useRef<HTMLElement | null>(null);
  const [desplazado, setDesplazado] = useState(false);
  const [mismoLienzo, setMismoLienzo] = useState(true);

  // Un centinela de 1px antes del encabezado: cuando el desplazamiento se lo
  // lleva —sea la ventana o el contenedor interno que scrollee— hay contenido
  // pasando por debajo.
  useEffect(() => {
    const nodo = sentinelaRef.current;
    if (!nodo) return;
    const observador = new IntersectionObserver(([entrada]) => setDesplazado(!entrada.isIntersecting));
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

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

  return { sentinelaRef, cabeceraRef, desplazado, conLinea: desplazado || mismoLienzo };
}
