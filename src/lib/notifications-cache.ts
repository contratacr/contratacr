export type CachedNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: { link?: string; project_id?: string | null; project_created_at?: string | null } | null;
};

const NOTIFICATIONS_CACHE_PREFIX = "ccr:notifications:";

const memory = new Map<string, { raw: string; items: CachedNotification[] }>();
const CACHE_EVENT = "ccr:notifications-cache-changed";

export function subscribeNotificationsCache(listener: () => void) {
  window.addEventListener(CACHE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(CACHE_EVENT, listener); window.removeEventListener("storage", listener); };
}

export function uniqueNotifications<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function readCachedNotifications(userId: string | undefined): CachedNotification[] | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${NOTIFICATIONS_CACHE_PREFIX}${userId}`);
    if (raw === null) { memory.delete(userId); return null; }
    const existing = memory.get(userId);
    if (existing?.raw === raw) return existing.items;
    const items = uniqueNotifications(JSON.parse(raw) as CachedNotification[]);
    memory.set(userId, { raw, items });
    return items;
  } catch {
    return null;
  }
}

export function cacheNotifications(userId: string | undefined, items: CachedNotification[]) {
  if (!userId || typeof window === "undefined") return;
  try {
    const saved = items.slice(0, 100);
    const raw = JSON.stringify(saved);
    memory.set(userId, { raw, items: saved });
    window.localStorage.setItem(`${NOTIFICATIONS_CACHE_PREFIX}${userId}`, raw);
    window.dispatchEvent(new Event(CACHE_EVENT));
  } catch {
    // Storage is an optimization; notifications still load from Supabase.
  }
}
