"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { formasDeNombre } from "@/lib/nombres";
import { cn } from "@/lib/utils";

/** Public name with visual ellipsis when it exceeds the available space. */
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
