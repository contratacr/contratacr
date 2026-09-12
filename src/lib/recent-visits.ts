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
  /** Momento de la visita, para mezclarla con las búsquedas en una sola lista. */
  at?: number;
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
    const siguientes = [{ ...visita, at: visita.at ?? Date.now() }, ...previas].slice(0, MAX_VISITAS);
    window.localStorage.setItem(clave(surface), JSON.stringify(siguientes));
    window.dispatchEvent(new CustomEvent(RECENT_VISITS_EVENT, { detail: { surface } }));
  } catch {
    // Un almacenamiento lleno o bloqueado no puede romper la navegación.
  }
}

export function clearRecentVisits(surface: RecentVisitSurface) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(clave(surface));
    window.dispatchEvent(new CustomEvent(RECENT_VISITS_EVENT, { detail: { surface } }));
  } catch {
    // Sin almacenamiento no hay nada que limpiar.
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

export type BusquedaReciente = { termino: string; at: number };

/** Búsquedas con su momento, para intercalarlas con los perfiles visitados en
 *  una sola lista de «Recientes». Las guardadas antes (solo el texto) valen
 *  con fecha 0 y quedan al final. */
export function leerBusquedasRecientesConFecha(): BusquedaReciente[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CLAVE_BUSQUEDAS) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): BusquedaReciente | null => {
        if (typeof item === "string") return { termino: item, at: 0 };
        if (item && typeof item.termino === "string") return { termino: item.termino, at: Number(item.at) || 0 };
        return null;
      })
      .filter((item): item is BusquedaReciente => !!item)
      .slice(0, MAX_BUSQUEDAS);
  } catch {
    return [];
  }
}

export function leerBusquedasRecientes(): string[] {
  return leerBusquedasRecientesConFecha().map((item) => item.termino);
}

export function guardarBusquedaReciente(termino: string) {
  if (typeof window === "undefined") return;
  const limpio = termino.trim();
  if (!limpio) return;
  try {
    const previas = leerBusquedasRecientesConFecha().filter((item) => item.termino.toLocaleLowerCase("es-CR") !== limpio.toLocaleLowerCase("es-CR"));
    window.localStorage.setItem(CLAVE_BUSQUEDAS, JSON.stringify([{ termino: limpio, at: Date.now() }, ...previas].slice(0, MAX_BUSQUEDAS)));
  } catch {
    // Sin almacenamiento la búsqueda corre igual; solo no queda guardada.
  }
}

/** Borra UNA búsqueda. Sin esto la única salida era vaciar todo el historial,
 *  que es demasiado castigo para quitarse de encima un término mal escrito. */
export function olvidarBusquedaReciente(termino: string) {
  if (typeof window === "undefined") return;
  try {
    const quedan = leerBusquedasRecientesConFecha().filter(
      (item) => item.termino.toLocaleLowerCase("es-CR") !== termino.trim().toLocaleLowerCase("es-CR"),
    );
    if (quedan.length === 0) window.localStorage.removeItem(CLAVE_BUSQUEDAS);
    else window.localStorage.setItem(CLAVE_BUSQUEDAS, JSON.stringify(quedan));
  } catch {
    // Sin almacenamiento no hay historial que borrar.
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
