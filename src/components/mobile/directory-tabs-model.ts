// Lógica pura de la barra del directorio (sin React): la importan la barra y el spec de Playwright.
export type DirectoryTabId = "buscar" | "proyectos" | "asistente" | "listas" | "yo";

const LABELS: Record<DirectoryTabId, { es: string; en: string }> = {
  buscar: { es: "Buscar", en: "Search" },
  proyectos: { es: "Proyectos", en: "Projects" },
  asistente: { es: "Asistente", en: "Assistant" },
  listas: { es: "Mis listas", en: "My Lists" },
  yo: { es: "Yo", en: "Me" },
};

export const DIRECTORY_TAB_ORDER: readonly DirectoryTabId[] = ["buscar", "proyectos", "asistente", "listas", "yo"];

export function directoryTabLabel(id: DirectoryTabId, locale: string): string {
  const en = locale === "en";
  return en ? LABELS[id].en : LABELS[id].es;
}

/** Cuál pestaña está encendida para una ruta (sin prefijo de idioma). `null` si ninguna (p. ej. /empleos, /promociones: viven en «Más»). */
export function directoryActiveTab(pathname: string | null | undefined, sections: readonly string[] = [], esBusqueda = false): DirectoryTabId | null {
  const ruta = (pathname ?? "").replace(/\/+$/, "") || "/";
  const en = (base: string) => ruta === base || ruta.startsWith(`${base}/`);
  if (en("/solicitudes")) return "proyectos";
  if (en("/asistente")) return "asistente";
  if (en("/listas") || en("/lista")) return "listas";
  if (en("/yo") || en("/notificaciones") || en("/mensajes") || en("/dashboard") || ruta === "/empleos/mis-empleos" || ruta === "/promociones/mis-promociones") return "yo";
  if (ruta === "/" || ruta === "/buscar" || en("/buscar") || en("/negocios") || en("/lugares") || en("/servicios") || en("/profesionales") || esBusqueda) return "buscar";
  if (sections.some((section) => en(`/${section}`))) return "buscar";
  return null;
}

/** Tope de la insignia: «99+» por encima de 99, nada con 0. */
export function directoryBadgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? "99+" : String(Math.floor(count));
}

