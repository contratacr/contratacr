type CacheEntry<T> = {
  data?: T;
  promise?: Promise<T>;
  updatedAt?: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
// Components painting from the cache subscribe per key; every write (a refresh
// landing, an optimistic edit, a notification-driven prefetch) tells them.
const listeners = new Map<string, Set<(data: unknown) => void>>();
const STORAGE_PREFIX = "ccr:dashboard-cache:";
const STORAGE_VERSION = 1;
const STORAGE_TTL_MS = 5 * 60 * 1000;

type StoredCacheEntry<T> = {
  version: number;
  updatedAt: number;
  data: T;
};

function storageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`;
}

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function readStoredCache<T>(key: string): CacheEntry<T> | null {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCacheEntry<T>;
    if (parsed.version !== STORAGE_VERSION || !parsed.updatedAt || !("data" in parsed)) {
      window.sessionStorage.removeItem(storageKey(key));
      return null;
    }
    if (Date.now() - parsed.updatedAt > STORAGE_TTL_MS) {
      window.sessionStorage.removeItem(storageKey(key));
      return null;
    }
    return { data: parsed.data, updatedAt: parsed.updatedAt };
  } catch {
    try { window.sessionStorage.removeItem(storageKey(key)); } catch {}
    return null;
  }
}

function writeStoredCache<T>(key: string, data: T, updatedAt: number) {
  if (!canUseSessionStorage()) return;
  try {
    const entry: StoredCacheEntry<T> = { version: STORAGE_VERSION, updatedAt, data };
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // Storage can be disabled or full. Memory cache still keeps the app working.
  }
}

export function getDashboardCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && "data" in entry) return entry.data as T;
  const stored = readStoredCache<T>(key);
  if (!stored) return null;
  cache.set(key, stored);
  return stored.data as T;
}

export function setDashboardCache<T>(key: string, data: T) {
  const updatedAt = Date.now();
  cache.set(key, { data, updatedAt });
  writeStoredCache(key, data, updatedAt);
  listeners.get(key)?.forEach((listener) => listener(data));
}

export function subscribeDashboardCache<T>(key: string, listener: (data: T) => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener as (data: unknown) => void);
  return () => {
    set?.delete(listener as (data: unknown) => void);
    if (set && set.size === 0) listeners.delete(key);
  };
}

/** Forget every cached entry (memory and session storage). Run on sign-out so
 *  the next account in this tab never paints the previous one's data. */
export function clearDashboardCache() {
  cache.clear();
  if (!canUseSessionStorage()) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Storage can be disabled; the memory cache is already gone.
  }
}

export async function loadDashboardCache<T>(
  key: string,
  loader: () => Promise<T>,
  options: { force?: boolean } = {}
): Promise<T> {
  const existing = (cache.get(key) as CacheEntry<T> | undefined) ?? readStoredCache<T>(key) ?? undefined;
  if (existing && !cache.has(key)) cache.set(key, existing);
  if (!options.force) {
    if (existing && "data" in existing) return existing.data as T;
    if (existing?.promise) return existing.promise;
  }

  const promise: Promise<T> = loader()
    .then((data) => {
      setDashboardCache(key, data);
      return data;
    })
    .catch((error) => {
      const current = cache.get(key) as CacheEntry<T> | undefined;
      if (current?.promise === promise) {
        if (current && "data" in current) {
          cache.set(key, { data: current.data, updatedAt: current.updatedAt });
        } else {
          cache.delete(key);
        }
      }
      throw error;
    });

  const nextEntry: CacheEntry<T> = { promise, updatedAt: existing?.updatedAt };
  if (existing && "data" in existing) nextEntry.data = existing.data;
  cache.set(key, nextEntry);
  return promise;
}

export function prefetchDashboardCache<T>(key: string, loader: () => Promise<T>) {
  void loadDashboardCache(key, loader).catch((error) => {
    console.warn("[dashboard-prefetch] failed", error);
  });
}
