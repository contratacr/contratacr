"use client";

import { useEffect } from "react";

/**
 * Las dos marcas que encienden las sombras del borde, en TODAS las pantallas.
 *
 * - `data-ccr-desplazado`: hay contenido pasando por debajo de la cabecera.
 * - `data-ccr-al-final`: no queda nada debajo de la franja del pie.
 *
 * Vivían dentro de `useBarraAccionFija`, que solo corre en las pantallas que
 * montan una franja de acciones al pie. Resultado: en la mayoría del app la
 * cabecera pegada NUNCA levantaba sombra al desplazar, por mucho que llevara la
 * clase. Isaac lo reportó como «hay muchas secciones en las que el navbar al
 * scrollear no tiene sombras», y tenía razón: no era que faltara la regla, es
 * que faltaba quien la encendiera.
 *
 * Va montado en el layout, así que no depende de qué tenga cada pantalla.
 * Las reglas de CSS viven en `src/app/layout.tsx` (`data-ccr-sombras`).
 */
export function SombrasAlDesplazar() {
  useEffect(() => {
    const mirar = () => {
      const doc = document.scrollingElement ?? document.documentElement;
      const alFinal = doc.scrollTop + doc.clientHeight >= doc.scrollHeight - 2;
      document.body.toggleAttribute("data-ccr-al-final", alFinal);
      document.body.toggleAttribute("data-ccr-desplazado", doc.scrollTop > 1);
    };
    mirar();
    // El alto de la página cambia solo —una lista que llega, una sección que se
    // abre—, así que no basta con escuchar el desplazamiento.
    const observador = new ResizeObserver(mirar);
    observador.observe(document.documentElement);
    if (document.body) observador.observe(document.body);
    window.addEventListener("scroll", mirar, { passive: true });
    window.addEventListener("resize", mirar);
    return () => {
      observador.disconnect();
      window.removeEventListener("scroll", mirar);
      window.removeEventListener("resize", mirar);
      document.body.removeAttribute("data-ccr-al-final");
      document.body.removeAttribute("data-ccr-desplazado");
    };
  }, []);
  return null;
}
