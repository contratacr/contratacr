import { catalogoParaElCliente } from "@/lib/data/server-category-catalog";
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
 */
export default async function ServiciosPage() {
  const catalogoInicial = await catalogoParaElCliente();
  return <ServiciosClient catalogoInicial={catalogoInicial} />;
}
