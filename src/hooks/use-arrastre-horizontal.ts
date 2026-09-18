"use client";

import { useEffect, type RefObject } from "react";

/**
 * Arrastrar un carril horizontal con el MOUSE, como se hace con el dedo.
 *
 * En el teléfono un carril de pestañas o de miniaturas se desliza solo; en
 * computadora no hay dedo, y una fila que sigue hacia la derecha quedaba fuera
 * de alcance para quien no tiene panel táctil ni sabe de Mayús + rueda. Con
 * esto se agarra y se arrastra. La barrita fina que aparece al pasar el cursor
 * (clase `ccr-carril`, en layout.tsx) es la pista de que se puede.
 *
 * Solo responde al mouse: el dedo y el lápiz ya tienen su gesto nativo. Y si
 * hubo arrastre, el clic que suelta no cuenta —si no, soltar encima de una
 * pestaña la activaba—.
 */
export function useArrastreHorizontal(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const carril = ref.current;
    if (!carril) return;
    let inicioX = 0;
    let inicioScroll = 0;
    let presionado = false;
    let arrastro = false;

    const alBajar = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if (carril.scrollWidth <= carril.clientWidth + 2) return;
      presionado = true;
      arrastro = false;
      inicioX = e.clientX;
      inicioScroll = carril.scrollLeft;
    };
    const alMover = (e: PointerEvent) => {
      if (!presionado) return;
      const dx = e.clientX - inicioX;
      if (!arrastro && Math.abs(dx) < 5) return;
      arrastro = true;
      carril.style.cursor = "grabbing";
      carril.style.userSelect = "none";
      carril.scrollLeft = inicioScroll - dx;
    };
    const alSoltar = () => {
      if (!presionado) return;
      presionado = false;
      carril.style.cursor = "";
      carril.style.userSelect = "";
    };
    const alClic = (e: MouseEvent) => {
      if (!arrastro) return;
      arrastro = false;
      e.preventDefault();
      e.stopPropagation();
    };

    carril.addEventListener("pointerdown", alBajar);
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
    carril.addEventListener("click", alClic, true);
    return () => {
      carril.removeEventListener("pointerdown", alBajar);
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      carril.removeEventListener("click", alClic, true);
    };
  }, [ref]);
}
