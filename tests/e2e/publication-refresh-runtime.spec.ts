import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function harness() {
  const events = new EventTarget();
  const effects: Array<() => void | (() => void)> = [];
  const refs: Array<{ current: unknown }> = [];
  let cursor = 0;
  let pathname = "/publicar";
  let mutation: { domain: string; at: number } | null = null;
  let refreshes = 0;
  let loads = 0;
  const timers = new Map<number, () => void>();
  const router = { refresh: () => { refreshes++; } };
  const globals = {
    window: Object.assign(events, {
      setTimeout: (fn: () => void) => { const id = timers.size + 1; timers.set(id, fn); return id; },
      clearTimeout: (id: number) => timers.delete(id),
    }),
    document: Object.assign(new EventTarget(), { visibilityState: "visible" }),
  };
  const mocks: Record<string, unknown> = {
    "@/lib/app-events": { APP_RESUME_EVENT: "contratacr:app-resume" },
    react: {
      useEffect: (fn: () => void) => effects.push(fn),
      useRef: (value: unknown) => refs[cursor++] ?? (refs[cursor - 1] = { current: value }),
      useCallback: (fn: unknown) => fn,
      useSyncExternalStore: () => [],
    },
    "next/navigation": { useRouter: () => router, usePathname: () => pathname },
    "@/lib/app-data-invalidation": {
      APP_DATA_INVALIDATED_EVENT: "mutation", APP_DATA_INVALIDATED_KEY: "mutation-key",
      readLastAppDataInvalidation: () => mutation, invalidateAppData: () => {},
    },
    "@/lib/dashboard-prefetch-cache": {
      loadDashboardCache: async (_key: string, loader: () => Promise<unknown>) => { loads++; return loader(); },
    },
  };
  function load(file: string) {
    const box = { exports: {} as Record<string, (...args: unknown[]) => unknown> };
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    runInNewContext(code, { module: box, exports: box.exports, require: (id: string) => mocks[id], console, ...globals });
    return box.exports;
  }
  return {
    load, effects,
    navigate: (next: string) => { pathname = next; cursor = 0; effects.length = 0; },
    publish: (domain: string) => {
      mutation = { domain, at: Date.now() };
      events.dispatchEvent(Object.assign(new Event("mutation"), { detail: mutation }));
    },
    flush: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    refreshes: () => refreshes, loads: () => loads,
  };
}

test("publishing then navigating refreshes the destination even if the source already refreshed", () => {
  const h = harness();
  const { GlobalDataRefresh } = h.load("src/components/util/global-data-refresh.tsx");
  GlobalDataRefresh(); h.effects.forEach(fn => fn());
  h.publish("offers"); h.flush();
  expect(h.refreshes()).toBe(1);
  h.navigate("/promociones/new"); GlobalDataRefresh(); h.effects.at(-1)!();
  expect(h.refreshes()).toBe(2);
  h.navigate("/promociones"); GlobalDataRefresh(); h.effects.at(-1)!();
  expect(h.refreshes()).toBe(2);
});

test("immediate navigation cancels the delayed refresh of the previous screen", () => {
  const h = harness();
  const { GlobalDataRefresh } = h.load("src/components/util/global-data-refresh.tsx");
  GlobalDataRefresh(); h.effects.forEach(fn => fn());
  h.publish("jobs");
  h.navigate("/empleos/new"); GlobalDataRefresh(); h.effects.at(-1)!(); h.flush();
  expect(h.refreshes()).toBe(1);
});

for (const domain of ["projects", "offers", "jobs"]) {
  test(`${domain}: a mounted panel reloads on its publication event without an app restart`, async () => {
    const h = harness();
    const { useCachedResource } = h.load("src/hooks/use-cached-resource.ts");
    useCachedResource(`dashboard:${domain}:user`, async () => ["published"], [], { invalidationDomain: domain });
    const cleanups = h.effects.map(fn => fn());
    await Promise.resolve();
    const initial = h.loads();
    h.publish("profile"); expect(h.loads()).toBe(initial);
    h.publish(domain); expect(h.loads()).toBe(initial + 1);
    cleanups.forEach(fn => { if (typeof fn === "function") fn(); });
    h.publish(domain); expect(h.loads()).toBe(initial + 1);
  });
}
