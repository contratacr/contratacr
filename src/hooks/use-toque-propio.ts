"use client";

import { useCallback, useRef } from "react";

/**
 * Un control solo responde si el toque EMPEZÓ en él.
 *
 * Al tocar un buscador, el sistema sube el teclado y mueve la página; el
 * `click` llega después, cuando debajo del dedo ya hay otro elemento, y ese
 * elemento se lleva el toque. Así se abría un filtro «solo» al tocar el campo
 * de búsqueda de Empleos. Un toque real siempre trae su `pointerdown` en el
 * mismo control; el fantasma del desplazamiento, no.
 *
 * Con teclado o lector de pantalla el `click` viene sin puntero (`detail === 0`)
 * y pasa sin condiciones.
 */
export function useToquePropio() {
  const empezoAqui = useRef(false);

  const onPointerDown = useCallback(() => {
    empezoAqui.current = true;
  }, []);

  const alTocar = useCallback(
    (accion: () => void) => (event: { detail: number }) => {
      if (event.detail > 0 && !empezoAqui.current) return;
      empezoAqui.current = false;
      accion();
    },
    [],
  );

  return { onPointerDown, alTocar };
}
