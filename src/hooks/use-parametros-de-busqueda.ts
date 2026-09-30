"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { filtrosDeRuta } from "@/lib/buscar-url";
import { esServicioDelCatalogo } from "@/lib/data/categories";

/**
 * Los parámetros de la búsqueda tal como la página los entiende, aunque la
 * barra del navegador lleve la ruta bonita (/buscar/construccion/alajuela).
 * `useSearchParams` solo ve lo que hay detrás del «?»; el servicio y el lugar
 * viven ahora en la ruta, y aquí se vuelven a juntar. Un solo lector para que
 * ningún componente tenga que saber de dónde salió cada cosa.
 */
export function useParametrosDeBusqueda(): URLSearchParams {
  const sp = useSearchParams();
  const pathname = usePathname();
  return useMemo(() => {
    const juntos = new URLSearchParams(sp.toString());
    const enRuta = filtrosDeRuta(pathname, esServicioDelCatalogo);
    if (enRuta?.categoria) juntos.set("categoria", enRuta.categoria);
    if (enRuta?.provincia) juntos.set("provincia", enRuta.provincia);
    if (enRuta?.canton) juntos.set("canton", enRuta.canton);
    return juntos;
  }, [sp, pathname]);
}
