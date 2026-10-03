"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recoverBodyScrollLock } from "@/lib/body-scroll-lock";
import { irAlInicio, noInsistirArriba } from "@/lib/ir-al-inicio";
import { anotarCambioDeRuta, anotarPosicion, posicionAnotada, reponer, volverSiEsLaAnterior } from "@/lib/volver-por-historial";

// Volver o avanzar con el historial (flecha del navegador, gesto de iOS o una
// flecha de la app que vuelve a la pantalla anterior) repone la altura en vez
// de estrenar arriba.
let porHistorial = false;
let reponiendo = false;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => { porHistorial = true; });
  // LAS FLECHAS DE «VOLVER» de toda la app (enlaces con la flecha ← o rotulados
  // «Volver…»): si llevan a la pantalla de la que se vino, se vuelve por el
  // historial —la lista queda donde estaba— en vez de abrirla de nuevo arriba.
  // Va en captura, antes que el manejador del <Link>.
  document.addEventListener("click", (evento) => {
    if (evento.defaultPrevented || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    const enlace = (evento.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!enlace || enlace.target === "_blank" || enlace.origin !== window.location.origin) return;
    const esVolver = !!enlace.querySelector("svg.lucide-arrow-left, svg.lucide-chevron-left") || /^(volver|back)/i.test(enlace.getAttribute("aria-label") ?? "");
    if (!esVolver) return;
    if (volverSiEsLaAnterior(enlace.pathname + enlace.search)) {
      evento.preventDefault();
      evento.stopImmediatePropagation();
    }
  }, { capture: true });
  let cuadro = 0;
  let ultimoObjetivo: EventTarget | null = null;
  window.addEventListener("scroll", (evento) => {
    ultimoObjetivo = evento.target;
    if (cuadro) return;
    // Recién vuelto por el historial la dirección ya es la de la lista pero en
    // pantalla sigue la ficha: lo que se mueva ahora NO es la altura de la lista.
    cuadro = window.requestAnimationFrame(() => { cuadro = 0; if (!porHistorial && !reponiendo) anotarPosicion(ultimoObjetivo); });
  }, { capture: true, passive: true });
}

/**
 * Client-side navigation keeps the browser document alive, so an old page's
 * scroll position (or a stale modal body lock) can otherwise leak into the
 * next section. Query-only search changes are reset by their own scrollable
 * result surface; this handles real route/section changes app-wide.
 */
export function RouteScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    anotarCambioDeRuta();
    if (window.location.hash) return;
    const volviendo = porHistorial;
    porHistorial = false;
    const destino = volviendo ? posicionAnotada() : null;
    if (destino) {
      // La lista puede tardar en tener su altura (datos, imágenes): se insiste
      // hasta llegar o hasta 1,2 s, y se corta si el dedo arrastra.
      noInsistirArriba();
      recoverBodyScrollLock();
      reponiendo = true;
      const inicio = performance.now();
      let cortado = false;
      const cortar = () => { cortado = true; };
      window.addEventListener("touchmove", cortar, { passive: true, capture: true });
      window.addEventListener("wheel", cortar, { passive: true, capture: true });
      let id = 0;
      const paso = () => {
        if (cortado) { reponiendo = false; return; }
        const llego = reponer(destino);
        // Se sigue sosteniendo un rato aunque ya llegó: la pantalla termina de
        // acomodarse (la hoja de resultados cambia de alto) y la movía de nuevo.
        const t = performance.now() - inicio;
        if ((!llego || t < 900) && t < 3000) id = window.requestAnimationFrame(paso);
        else reponiendo = false;
      };
      id = window.requestAnimationFrame(paso);
      return () => {
        reponiendo = false;
        window.cancelAnimationFrame(id);
        window.removeEventListener("touchmove", cortar, { capture: true });
        window.removeEventListener("wheel", cortar, { capture: true });
      };
    }
    const frame = window.requestAnimationFrame(() => {
      recoverBodyScrollLock();
      irAlInicio();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
