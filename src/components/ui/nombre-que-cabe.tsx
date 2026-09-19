"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { formasDeNombre } from "@/lib/nombres";
import { cn } from "@/lib/utils";

/**
 * Un nombre de persona en una sola línea que se acorta con criterio antes de
 * cortarse: entero → sin el segundo nombre → sin el segundo apellido. Solo si
 * ni la forma más corta cabe, se corta con puntos (`truncate`).
 *
 * Se mide el texto de verdad, con la letra que tenga puesta: cada forma se
 * prueba en el mismo nodo antes de pintar, así no parpadea.
 */
export function NombreQueCabe({ nombre, className }: { nombre: string; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [indice, setIndice] = useState(0);
  const formas = formasDeNombre(nombre);

  useLayoutEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;
    const elegir = () => {
      const opciones = formasDeNombre(nombre);
      let elegido = opciones.length - 1;
      for (let i = 0; i < opciones.length; i += 1) {
        nodo.textContent = opciones[i];
        if (nodo.scrollWidth <= nodo.clientWidth + 1) { elegido = i; break; }
      }
      nodo.textContent = opciones[elegido] ?? "";
      setIndice(Math.max(0, elegido));
    };
    elegir();
    const observador = new ResizeObserver(elegir);
    observador.observe(nodo);
    return () => observador.disconnect();
  }, [nombre]);

  return (
    <span ref={ref} title={nombre} className={cn("block min-w-0 truncate", className)}>
      {formas[indice] ?? nombre}
    </span>
  );
}
