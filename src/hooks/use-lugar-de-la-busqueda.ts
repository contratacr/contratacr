"use client";

import { usePathname } from "next/navigation";
import { filtrosDeRuta } from "@/lib/buscar-url";
import { getCantonById, getProvinceById, nombreDeLugar } from "@/lib/data/cr-geography";

/**
 * El lugar que dice la dirección de la búsqueda («Atenas, Alajuela»), para que
 * el mensaje que se abre desde un resultado empiece diciendo dónde. Fuera de
 * /buscar devuelve cadena vacía: no hay lugar que nombrar.
 */
export function useLugarDeLaBusqueda(): string {
  const pathname = usePathname();
  const filtros = filtrosDeRuta(pathname);
  if (!filtros?.provincia) return "";
  const province = getProvinceById(filtros.provincia);
  const canton = filtros.canton ? getCantonById(filtros.canton) : undefined;
  return nombreDeLugar(canton, province);
}
