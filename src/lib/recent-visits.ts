// Lo último que la persona abrió, para que el buscador ofrezca volver ahí de un
// toque: un profesional con su foto, una oferta o un empleo. Vive en el
// navegador porque es una comodidad del dispositivo, no un dato de la cuenta.
export type RecentVisitSurface = "profesionales" | "ofertas" | "empleos";

export type RecentVisit = {
  id: string;
  titulo: string;
  subtitulo?: string;
  imagen?: string;
  iniciales?: string;
  href: string;
};

const MAX_VISITAS = 6;
const clave = (surface: RecentVisitSurface) => `ccr-recent-visits:${surface}`;
export const RECENT_VISITS_EVENT = "ccr:recent-visits";

export function readRecentVisits(surface: RecentVisitSurface): RecentVisit[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(clave(surface)) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RecentVisit =>
        !!item && typeof item.id === "string" && typeof item.titulo === "string" && typeof item.href === "string")
      .slice(0, MAX_VISITAS);
  } catch {
    return [];
  }
}

export function recordRecentVisit(surface: RecentVisitSurface, visita: RecentVisit) {
  if (typeof window === "undefined") return;
  if (!visita.id || !visita.titulo.trim() || !visita.href) return;
  try {
    const previas = readRecentVisits(surface).filter((item) => item.id !== visita.id);
    const siguientes = [visita, ...previas].slice(0, MAX_VISITAS);
    window.localStorage.setItem(clave(surface), JSON.stringify(siguientes));
    window.dispatchEvent(new CustomEvent(RECENT_VISITS_EVENT, { detail: { surface } }));
  } catch {
    // Un almacenamiento lleno o bloqueado no puede romper la navegación.
  }
}

export function removeRecentVisit(surface: RecentVisitSurface, id: string) {
  if (typeof window === "undefined") return;
  try {
    const siguientes = readRecentVisits(surface).filter((item) => item.id !== id);
    window.localStorage.setItem(clave(surface), JSON.stringify(siguientes));
    window.dispatchEvent(new CustomEvent(RECENT_VISITS_EVENT, { detail: { surface } }));
  } catch {
    // Sin almacenamiento no hay nada que limpiar.
  }
}

// Las búsquedas que la persona ejecutó en /buscar, para ofrecerlas de vuelta
// igual que hacen Ofertas y Empleos con las suyas.
const CLAVE_BUSQUEDAS = "ccr-search-recents";
const MAX_BUSQUEDAS = 6;

export function leerBusquedasRecientes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CLAVE_BUSQUEDAS) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, MAX_BUSQUEDAS) : [];
  } catch {
    return [];
  }
}

export function guardarBusquedaReciente(termino: string) {
  if (typeof window === "undefined") return;
  const limpio = termino.trim();
  if (!limpio) return;
  try {
    const previas = leerBusquedasRecientes().filter((item) => item.toLocaleLowerCase("es-CR") !== limpio.toLocaleLowerCase("es-CR"));
    window.localStorage.setItem(CLAVE_BUSQUEDAS, JSON.stringify([limpio, ...previas].slice(0, MAX_BUSQUEDAS)));
  } catch {
    // Sin almacenamiento la búsqueda corre igual; solo no queda guardada.
  }
}

export function olvidarBusquedasRecientes() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CLAVE_BUSQUEDAS);
  } catch {
    // Nada que limpiar.
  }
}
