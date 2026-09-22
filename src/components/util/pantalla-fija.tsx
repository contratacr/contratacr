"use client";

import { useEffect } from "react";

/**
 * UNA PANTALLA QUE NO SE MUEVE. Marca el documento entero como fijo: ni
 * desplazamiento ni rebote elástico. Las pantallas que son un tablero —lista
 * propia que se desplaza por dentro— ya medían justo la ventana, así que no
 * había a dónde ir; pero al arrastrar, el documento igual cedía unos píxeles
 * y volvía (el rebote de WebKit y el de macOS). Eso delata que hay una página
 * debajo, y en un tablero no la hay.
 *
 * La marca la pone también un guion en `layout.tsx` antes del primer pintado,
 * para que la primera carga no llegue sin ella; este componente la mantiene al
 * navegar dentro del sitio y la retira al salir de la pantalla.
 */
export function PantallaFija() {
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.classList.add("ccr-ruta-sin-desplazar");
    return () => raiz.classList.remove("ccr-ruta-sin-desplazar");
  }, []);
  return null;
}
