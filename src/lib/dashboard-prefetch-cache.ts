type CacheEntry<T> = {
  data?: T;
  promise?: Promise<T>;
  updatedAt?: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function getDashboardCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  return entry && "data" in entry ? (entry.data as T) : null;
}

export function setDashboardCache<T>(key: string, data: T) {
  cache.set(key, { data, updatedAt: Date.now() });
}

export async function loadDashboardCache<T>(
  key: string,
  loader: () => Promise<T>,
  options: { force?: boolean } = {}
): Promise<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (!options.force) {
    if (existing && "data" in existing) return existing.data as T;
    if (existing?.promise) return existing.promise;
  }

  let promise: Promise<T>;
  promise = loader()
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
