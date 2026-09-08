"use client";

import { useSyncExternalStore } from "react";

// ¿Estamos en la vista de computadora (lg de Tailwind)? Se resuelve con
// useSyncExternalStore para que el servidor pinte la vista de teléfono y el
// navegador corrija en la hidratación, sin efectos ni parpadeo.
const consulta = () => window.matchMedia("(min-width: 1024px)");

function suscribir(avisar: () => void) {
  const mq = consulta();
  mq.addEventListener("change", avisar);
  return () => mq.removeEventListener("change", avisar);
}

export function useEsEscritorio(): boolean {
  return useSyncExternalStore(suscribir, () => consulta().matches, () => false);
}
