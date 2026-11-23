import { unstable_cache } from "next/cache";
import { catalogoParaElCliente } from "@/lib/data/server-category-catalog";
import { DIR_ENABLED } from "@/lib/directory/feature-flags";
import { PLACE_SECTIONS } from "@/lib/directory/place-verticals";
import { countDirectoryPlaces } from "@/lib/directory/search-server";
import type { SearchVertical } from "@/lib/directory/search-schemas";
import { ServiciosClient } from "./servicios-client";

/**
 * La envoltura de servidor de /servicios.
 *
 * La pantalla es de cliente —buscador, grupos, vistas de teléfono—, pero su
 * CONTENIDO es el catálogo de servicios, y ese catálogo vive en la base. Una
 * página de cliente no lo ve al pre-renderizarse (ver `catalogoParaElCliente`),
 * así que salía con el catálogo fijo y se rehacía entera al hidratar. Aquí se
 * trae en el servidor y se le entrega como dato: el primer pintado ya es el
 * completo, no cambia después, y es lo que lee Google.
 *
 * Con el directorio encendido también se trae el total de negocios de cada
 * sección (las baldosas de "Empresas"). Si la cuenta falla, la baldosa se pinta
 * sin número: nunca un "0" inventado. Una falla total lanza y no se guarda.
 */
const placeTotals = unstable_cache(async () => {
  const entries = await Promise.all(PLACE_SECTIONS.map(async (s) => [s.section, await countDirectoryPlaces(s.section as SearchVertical, {})] as const));
  if (entries.every(([, n]) => n === null)) throw new Error("sin conteos");
  return Object.fromEntries(entries) as Record<string, number | null>;
}, ["servicios-place-totals-v1"], { revalidate: 600 });

export default async function ServiciosPage() {
  const [catalogoInicial, placeTotalsBySection] = await Promise.all([
    catalogoParaElCliente(),
    DIR_ENABLED ? placeTotals().catch(() => ({} as Record<string, number | null>)) : Promise.resolve({} as Record<string, number | null>),
  ]);
  return <ServiciosClient catalogoInicial={catalogoInicial} placeTotals={placeTotalsBySection} />;
}
