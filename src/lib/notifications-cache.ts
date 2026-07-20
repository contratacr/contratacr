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
    return raw === null ? null : uniqueNotifications(JSON.parse(raw) as CachedNotification[]);
  } catch {
    return null;
  }
}

export function cacheNotifications(userId: string | undefined, items: CachedNotification[]) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${NOTIFICATIONS_CACHE_PREFIX}${userId}`, JSON.stringify(items.slice(0, 100)));
  } catch {
    // Storage is an optimization; notifications still load from Supabase.
  }
}
