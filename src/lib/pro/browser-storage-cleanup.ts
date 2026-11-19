/**
 * Single cleanup point for every browser key the Pro suite writes.
 *
 * Pro keeps only unsent form drafts, retry journals of writes the server has not
 * confirmed yet (each removed on server ack) and unsent upload bytes. The server
 * stays the source of truth. These records are scoped per account, and here they
 * get a bounded lifetime:
 *  - all of them are removed on sign-out and when the account is disabled or deleted;
 *  - all of them are removed after 30 days without a signed-in visit on this device;
 *  - write-only "kept attempt" archives (after a rejection or permission denial)
 *    are removed seven days after they first appear.
 *
 * Not covered on purpose: pre-login handoffs that never belong to an account and
 * expire by themselves (appointment-login draft and project-invite code, 30 min),
 * the anonymous bid-portal device id, the payer's tab-scoped payment-link token
 * and the public mini-site visit markers.
 */

const PREFIXES = [
  "ccr:pro:",
  "ccr:client-operation:v1:",
  "contratacr:service-package-attempt:",
  "contratacr:appointment-reminder:",
] as const;
const EXACT_KEYS = new Set(["ccr:project-invite-joined", "ccr-client-project-from-app"]);
export const PRO_INDEXED_DATABASES = [
  "ccr-pro-company-file-recovery",
  "ccr-pro-daily-log-files",
  "ccr-pro-delivery-photo-recovery",
  "ccr-pro-team-task-discussion",
  "ccr-pro-work-file-recovery",
] as const;

const ACTIVITY_KEY = "ccr:pro:storage-activity:v1";
const ARCHIVE_LEDGER_KEY = "ccr:pro:storage-archive-ledger:v1";
const INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;
const ARCHIVE_MS = 7 * 24 * 60 * 60 * 1000;
const ARCHIVE_SEGMENT = /:(?:archive|archived|rejected):/;
const IDB_DELETE_TIMEOUT_MS = 1_500;

type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function isProBrowserStorageKey(key: string) {
  return EXACT_KEYS.has(key) || PREFIXES.some((prefix) => key.startsWith(prefix));
}

function stores(): KeyStore[] {
  if (typeof window === "undefined") return [];
  const found: KeyStore[] = [];
  const add = (read: () => KeyStore | undefined) => {
    try { const store = read(); if (store) found.push(store); } catch { /* storage disabled */ }
  };
  add(() => window.localStorage);
  add(() => window.sessionStorage);
  return found;
}

function proKeys(store: KeyStore) {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key && isProBrowserStorageKey(key)) keys.push(key);
  }
  return keys;
}

function deleteDatabase(factory: IDBFactory, name: string) {
  return new Promise<void>((resolve) => {
    try {
      const request = factory.deleteDatabase(name);
      // "blocked" means another tab still has it open: the deletion stays queued
      // and completes as soon as that tab closes its connection.
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Remove every Pro key (both storages, every account on this device) and the
 * Pro recovery databases. Resolves within ~1.5 s even if a database is busy. */
export async function clearProBrowserStorage() {
  for (const store of stores()) {
    try { proKeys(store).forEach((key) => store.removeItem(key)); } catch { /* storage disabled */ }
  }
  if (typeof window === "undefined") return;
  let factory: IDBFactory | undefined;
  try { factory = window.indexedDB; } catch { factory = undefined; }
  if (!factory) return;
  const idb = factory;
  await Promise.race([
    Promise.all(PRO_INDEXED_DATABASES.map((name) => deleteDatabase(idb, name))),
    new Promise((resolve) => setTimeout(resolve, IDB_DELETE_TIMEOUT_MS)),
  ]);
}

let swept = false;

/** Once per page load with a signed-in user: expire Pro records after 30 days
 * without a visit and expire kept-attempt archives after seven days. Leaves no
 * marker on devices that hold no Pro keys. */
export function sweepProBrowserStorage(now = Date.now()) {
  if (swept || typeof window === "undefined") return;
  swept = true;
  let local: KeyStore;
  try { local = window.localStorage; } catch { return; }
  try {
    const keys = proKeys(local).filter((key) => key !== ACTIVITY_KEY && key !== ARCHIVE_LEDGER_KEY);
    if (keys.length === 0) {
      local.removeItem(ACTIVITY_KEY);
      local.removeItem(ARCHIVE_LEDGER_KEY);
      return;
    }
    const last = Number(local.getItem(ACTIVITY_KEY));
    if (Number.isFinite(last) && last > 0 && now - last > INACTIVITY_MS) {
      void clearProBrowserStorage();
      return;
    }
    let ledger: Record<string, number> = {};
    try {
      const parsed = JSON.parse(local.getItem(ARCHIVE_LEDGER_KEY) ?? "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ledger = parsed;
    } catch { /* a corrupt ledger restarts the seven-day count */ }
    const next: Record<string, number> = {};
    for (const key of keys) {
      if (!ARCHIVE_SEGMENT.test(key)) continue;
      const first = typeof ledger[key] === "number" && ledger[key] <= now ? ledger[key] : now;
      if (now - first > ARCHIVE_MS) local.removeItem(key);
      else next[key] = first;
    }
    if (Object.keys(next).length > 0) local.setItem(ARCHIVE_LEDGER_KEY, JSON.stringify(next));
    else local.removeItem(ARCHIVE_LEDGER_KEY);
    local.setItem(ACTIVITY_KEY, String(now));
  } catch {
    /* storage disabled or full: nothing else to expire */
  }
}
