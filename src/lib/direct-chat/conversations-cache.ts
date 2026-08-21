// Warm cache for the conversation list. The inbox paints from it immediately
// and refreshes in the background, so opening Mensajes no longer waits on the
// API round trip that dominated its load time in the native shell.

type CachedConversations = { rows: unknown[]; fetchedAt: number };

const TTL_MS = 60_000;
let cached: CachedConversations | null = null;
let inFlight: Promise<CachedConversations | null> | null = null;

export function readCachedConversations(): unknown[] | null {
  if (!cached || Date.now() - cached.fetchedAt > TTL_MS) return null;
  return cached.rows;
}

export function storeConversations(rows: unknown[]) {
  cached = { rows, fetchedAt: Date.now() };
}

export function clearConversationsCache() {
  cached = null;
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
