"use client";

import { instalarCatalogoDesdeTexto } from "@/lib/data/categories";

/**
 * EL CATÁLOGO DE SERVICIOS, TAMBIÉN EN LA CAPA DE CLIENTE.
 *
 * Los nombres de los servicios salen de la base (un administrador puede
 * renombrarlos), y el registro que los guarda es una variable de módulo. El
 * problema: un componente `"use client"` se pre-renderiza en OTRA capa de
 * módulos, donde ese registro está VACÍO —el cargador de servidor solo llena el
 * suyo—. El carrusel de la portada pintaba entonces el nombre fijo del código
 * («Nutrición y dietética») mientras el navegador, que sí lee el catálogo del
 * documento antes de hidratar, pintaba el de la base («Nutrición»): dos textos
 * distintos para el mismo nodo y React tiraba el error #418 de hidratación en
 * la portada —invisible, pero real: React descartaba el HTML del servidor y
 * volvía a pintar la página entera desde cero—.
 *
 * Este componente instala el MISMO texto que viaja en <script id="ccr-catalogo">
 * dentro de la capa de cliente, y lo hace DURANTE EL RENDER —no en un efecto—
 * porque un efecto corre después del primer render, que es justo el que tiene
 * que coincidir. Va antes que nada en el <body>, así que para cuando cualquier
 * componente pida un nombre el registro ya está lleno de los dos lados.
 * Instalar el mismo texto dos veces no hace nada.
 */
export function CatalogoDelServidor({ texto }: { texto: string | null }) {
  instalarCatalogoDesdeTexto(texto);
  return null;
}
