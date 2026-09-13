// Warm cache for the conversation list. The inbox paints from it immediately
// and refreshes in the background, so opening Mensajes no longer waits on the
// API round trip that dominated its load time in the native shell.
//
// Vive en memoria Y en sessionStorage, con la misma vida que el resto del
// panel (cinco minutos): antes solo estaba en memoria y duraba un minuto, así
// que cada recarga o cada vuelta a Mensajes después de un minuto enseñaba el
// esqueleto aunque no hubiera nada nuevo. sessionStorage muere con la pestaña
// y se vacía al cerrar sesión, igual que la caché del panel.

type CachedConversations = { rows: unknown[]; fetchedAt: number };

const TTL_MS = 5 * 60_000;
const STORAGE_KEY = "ccr:direct-chat:conversations";
let cached: CachedConversations | null = null;
let inFlight: Promise<CachedConversations | null> | null = null;

function leerAlmacen(): CachedConversations | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedConversations;
    if (!parsed || !Array.isArray(parsed.rows) || typeof parsed.fetchedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function escribirAlmacen(valor: CachedConversations | null) {
  if (typeof window === "undefined") return;
  try {
    if (valor) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(valor));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // El almacén es una comodidad: la lista sigue viniendo de la API.
  }
}

export function readCachedConversations(): unknown[] | null {
  if (!cached) cached = leerAlmacen();
  if (!cached || Date.now() - cached.fetchedAt > TTL_MS) {
    cached = null;
    escribirAlmacen(null);
    return null;
  }
  return cached.rows;
}

export function storeConversations(rows: unknown[]) {
  cached = { rows, fetchedAt: Date.now() };
  escribirAlmacen(cached);
}

export function clearConversationsCache() {
  cached = null;
  escribirAlmacen(null);
}

export function prefetchConversations(): Promise<CachedConversations | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (readCachedConversations()) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  inFlight = fetch("/api/direct-chat", { cache: "no-store", credentials: "same-origin" })
    .then(async (res) => {
      if (!res.ok) return null;
      const json = await res.json();
      const rows = Array.isArray(json?.conversations) ? json.conversations : null;
      if (!rows) return null;
      storeConversations(rows);
      return cached;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
