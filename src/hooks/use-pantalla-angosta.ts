"use client";

import { useSyncExternalStore } from "react";

// ¿La pantalla es más angosta que un teléfono normal (menos de 360px)? Ahí una
// fila de tres filtros repartidos no alcanza para un rótulo largo con su
// conteo, y la fila tiene que deslizarse en vez de apretar o recortar.
//
// El servidor y el primer cuadro asumen que NO es angosta, que es el caso de
// todos los teléfonos de hoy: así la vista normal no cambia al hidratar. En un
// equipo de 320px el navegador corrige en la hidratación.
const consulta = () => window.matchMedia("(max-width: 359px)");

function suscribir(avisar: () => void) {
  const mq = consulta();
  mq.addEventListener("change", avisar);
  return () => mq.removeEventListener("change", avisar);
}

export function usePantallaAngosta(): boolean {
  return useSyncExternalStore(suscribir, () => consulta().matches, () => false);
}
