/**
 * DÓNDE NO VA LA BARRA DE ABAJO EN LA APP.
 *
 * Dos familias de pantallas viven sin ella:
 *
 * 1. Los flujos de PANTALLA COMPLETA (publicar proyecto, empleo, promoción):
 *    sin cabecera del app ni barra, porque el formulario necesita el alto
 *    entero y trae su propia forma de volver.
 *
 * 2. Las pantallas de DETALLE (la ficha de un profesional, un proyecto, una
 *    promoción, un empleo): conservan la cabecera con flecha y título, pero no
 *    la barra. Son pantallas «de adentro», como un producto en Amazon o un
 *    alojamiento en Airbnb: la barra es de la portada, no de la ficha. Además
 *    la ficha ya lleva su propia franja de contactar abajo; franja + barra se
 *    comían 140pt de un teléfono y se disputaban el fondo con la tarjeta de
 *    seguimiento. Para saltar a otra pestaña se vuelve primero, que es lo que
 *    una pantalla con flecha ya pide.
 *
 * La misma expresión vive, en literal, en el script de arranque de
 * `src/app/layout.tsx` (corre antes de hidratar, no puede importar); el
 * contrato de `scripts/validate-mobile-native-config.mjs` vigila que las dos
 * no se separen.
 */
import { esRutaDeBusqueda } from "@/lib/buscar-url";
import { esServicioDelCatalogo } from "@/lib/data/categories";

export const RUTA_DE_PANTALLA_COMPLETA = /(^|\/)(?:publicar-proyecto|(?:empleos|promociones)\/publicar)(?:\/|$)/;

// Un solo tramo después de la sección; `publicar`, `mis-empleos` y
// `mis-promociones` son listas o flujos, no fichas, y se quedan con la barra.
export const RUTA_DE_DETALLE = /^\/(?:(?:es|en)\/)?(?:profesionales\/[^/]+|proyectos\/[^/]+|promociones\/(?!publicar\/?$|mis-promociones\/?$)[^/]+|empleos\/(?!publicar\/?$|mis-empleos\/?$)[^/]+)\/?$/;

export function sinBarraDeAbajo(pathname: string | null | undefined): boolean {
  const ruta = pathname ?? "";
  // /profesionales/techos tiene la forma de una ficha pero es la búsqueda de
  // ese servicio: esa sí lleva la barra.
  return RUTA_DE_PANTALLA_COMPLETA.test(ruta) || (RUTA_DE_DETALLE.test(ruta) && !esRutaDeBusqueda(ruta, esServicioDelCatalogo));
}
