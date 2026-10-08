import { createNavigation } from "next-intl/navigation";
import { createElement, type ComponentProps } from "react";
import { routing } from "./routing";

const navegacion = createNavigation(routing);
export const { redirect, usePathname, useRouter } = navegacion;

type PropsDeEnlace = ComponentProps<typeof navegacion.Link>;

// PRECARGA APAGADA POR DEFECTO (2-oct-2026). En producción (OpenNext en
// Cloudflare) la precarga automática «solo metadatos» de ciertos enlaces
// —Privacidad en el menú y en el pie, «Publicar proyecto»— entraba en un bucle
// sin fin: la misma petición cada 28 ms (más de 100 en 4 s), que saturaba la
// conexión y hacía lenta toda navegación. En local no pasa. Mientras se
// resuelve de raíz, ningún enlace precarga solo por verse; los que importan
// (tableros del menú, barra de abajo) piden `prefetch={true}` explícito, que
// usa la precarga nueva por segmentos y no entra en bucle.
export function Link(props: PropsDeEnlace) {
  return createElement(navegacion.Link, { ...props, prefetch: props.prefetch ?? false });
}
