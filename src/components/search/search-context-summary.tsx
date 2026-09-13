"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * La barra de /buscar con una búsqueda hecha: el SERVICIO y el LUGAR en una sola
 * línea.
 *
 * Los dos se recortaban a la vez —«Instalación de aire acond…» y «Atenas,
 * Alaju…»— y así ninguno de los dos se leía. El servicio es lo que se buscó, así
 * que manda: cuando la fila no alcanza, lo primero que cede es el lugar, que se
 * queda con su primera parte (el cantón: «Atenas» en vez de «Atenas, Alajuela»).
 * Solo si ni así alcanza se recorta el servicio, y el lugar nunca pasa de la
 * mitad de la fila.
 */
export function SearchContextSummary({
  service,
  place,
  testId = "search-context-summary",
}: {
  service: string;
  place: string;
  testId?: string;
}) {
  const contenedorRef = useRef<HTMLSpanElement>(null);
  const medidorRef = useRef<HTMLSpanElement>(null);
  const [lugarCompleto, setLugarCompleto] = useState(true);
  const lugarCorto = place.split(",")[0].trim() || place;

  const medir = useCallback(() => {
    const contenedor = contenedorRef.current;
    const medidor = medidorRef.current;
    if (!contenedor || !medidor) return;
    const disponible = contenedor.clientWidth;
    if (disponible <= 0) return;
    const necesario = medidor.scrollWidth;
    setLugarCompleto((actual) => {
      const siguiente = necesario <= disponible;
      return actual === siguiente ? actual : siguiente;
    });
  }, []);

  useLayoutEffect(() => {
    medir();
    const observador = new ResizeObserver(medir);
    if (contenedorRef.current) observador.observe(contenedorRef.current);
    if (medidorRef.current) observador.observe(medidorRef.current);
    return () => observador.disconnect();
  }, [medir, service, place]);

  // La primera medida usa la tipografía de reserva; con la definitiva el texto
  // crece y lo que cabía deja de caber.
  useEffect(() => {
    let cancelado = false;
    const fuentes = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    void fuentes?.ready.then(() => { if (!cancelado) medir(); });
    return () => { cancelado = true; };
  }, [medir]);

  return (
    <span
      ref={contenedorRef}
      data-testid={testId}
      data-lugar={lugarCompleto ? "completo" : "corto"}
      className="relative flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden whitespace-nowrap text-[15px]"
    >
      <span className="min-w-0 truncate font-extrabold text-[#162543]">{service}</span>
      <span className="max-w-[50%] shrink-0 truncate font-medium text-[#8f9aaa]">
        {lugarCompleto ? place : lugarCorto}
      </span>
      {/* Medidor: la fila entera sin recortar, para saber si el lugar cabe completo. */}
      <span ref={medidorRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex items-baseline gap-2 whitespace-nowrap">
        <span className="font-extrabold">{service}</span>
        <span className="font-medium">{place}</span>
      </span>
    </span>
  );
}
