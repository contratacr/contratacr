import { test, expect } from "playwright/test";
import { analyticsPlatform, requestAnalyticsPlatform, webDeviceCategory, isNativeAnalyticsRuntime } from "../../src/lib/analytics/platform";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";

for (const runtime of ["web", "web_desktop", "web_mobile", "android", "ios", "native_unknown"] as const) {
  test(`all action writers identify ${runtime} using the same platform contract`, () => {
    const cookies = { ccr_platform: runtime.startsWith("web") ? "web" : "native", ccr_native_os: runtime, ccr_web_device: runtime.replace("web_", "") };
    expect(analyticsPlatform(name => cookies[name as keyof typeof cookies]).runtime).toBe(runtime);
    expect(requestAnalyticsPlatform(new Request("https://contratacr.com/api/projects", { headers: { cookie: Object.entries(cookies).map(([k,v]) => `${k}=${v}`).join("; ") } })).runtime).toBe(runtime);
  });
}

test("warm navigation, sign-in, resume and StrictMode do not duplicate usage; expiry opens a session", async () => {
  const effects: (() => void | (() => void))[] = [];
  const ref = { current: { route: "", session: "", actor: "", screen: "" } };
  const storage = new Map<string,string>();
  const calls: Record<string,unknown>[] = [];
  const listeners = new Map<string, () => void>();
  let path = "/dashboard/profesional", tab = "privacidad", user: { id: string } | null = null;
  let now = Date.now();
  const DateShim = class extends Date { static now() { return now; } };
  const source = ts.transpileModule(readFileSync("src/components/analytics/usage-capture.tsx","utf8"), { fileName: "usage-capture.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const moduleBox = { exports: {} as { UsageCapture: () => null } };
  const mocks: Record<string, unknown> = {
    "@/lib/analytics/platform": { isNativeAnalyticsRuntime },
    "react/jsx-runtime": { jsx: () => null },
    "./journey-capture": { JourneyCapture: () => null },
    "@/lib/analytics/native-measurement": { setNativeMeasurementActor: () => {}, configureNativeMeasurement: async () => {} },
    react: { useEffect: (fn: () => void) => effects.push(fn), useRef: () => ref },
    "next/navigation": { usePathname: () => path, useSearchParams: () => new URLSearchParams({ tab, code: "private-code", email: "private@example.com" }) },
    "@/hooks/use-auth": { useAuth: () => ({ user }) },
    "@/hooks/use-native-app": { useNativeApp: () => true },
    "@/lib/analytics/platform-client": { syncAnalyticsPlatform: () => "android" },
    "@/lib/analytics/trafico-automatizado": { esNavegadorAutomatizado: () => false },
    "@/lib/app-events": { APP_RESUME_EVENT: "resume" },
  };
  const fakeStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string,value: string) => storage.set(key,value) };
  const surface = { visibilityState: "visible", addEventListener: (name: string, fn: () => void) => listeners.set(name,fn), removeEventListener: (name: string) => listeners.delete(name) };
  runInNewContext(source, { module: moduleBox, exports: moduleBox.exports, require: (name: string) => mocks[name], document: surface, window: surface, sessionStorage: fakeStorage, localStorage: fakeStorage, crypto: webcrypto, Date: DateShim, fetch: async (_url: string, options: { body: string }) => { calls.push(JSON.parse(options.body)); return { ok: true }; } });
  const render = async () => { moduleBox.exports.UsageCapture(); effects.at(-1)?.(); await new Promise(resolve => setTimeout(resolve,0)); };
  await render(); await render();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ path, tab, firstUse: true });
  expect(JSON.stringify(calls)).not.toContain("private-code");
  user = { id: "account" }; await render();
  expect(calls).toHaveLength(2);
  expect(calls[1].screen).toBe(calls[0].screen);
  expect(calls[1].firstUse).toBe(false);
  listeners.get("resume")?.(); await new Promise(resolve => setTimeout(resolve,0));
  expect(calls).toHaveLength(2);
  tab = "cuenta"; await render();
  expect(calls).toHaveLength(3); expect(calls[2].screen).not.toBe(calls[0].screen); expect(calls[2].session).toBe(calls[0].session);
  now += 31*60_000; listeners.get("resume")?.(); await new Promise(resolve => setTimeout(resolve,0));
  expect(calls).toHaveLength(4); expect(calls[3].session).not.toBe(calls[0].session);
  path = "/profesionales"; await render();
  expect(calls).toHaveLength(5);
});

for (const runtime of ["web", "android", "ios"] as const) {
  test(`browser records usage classified as ${runtime}`, async ({ page }) => {
    const requests: { body: { path: string; session: string }; cookie: string }[] = [];
    await page.route("**/api/analytics/usage", async route => {
      // WebKit omits Cookie from intercepted request headers. Read the
      // destination cookie jar there; Chromium exposes the actual header.
      const cookie = (await route.request().allHeaders()).cookie || (await page.context().cookies(route.request().url())).map(item => `${item.name}=${item.value}`).join("; ");
      requests.push({ body: route.request().postDataJSON(), cookie });
      await route.fulfill({ status: 204, headers: { "set-cookie": "cc_analytics_sid=isolated-usage-test; Path=/; SameSite=Lax" } });
    });
    await page.route("**/api/analytics/interaction", route => route.fulfill({ status: 204 }));
    await page.route("**/api/attribution/claim", route => route.fulfill({ status: 200, json: { ok: true } }));
    await page.route("**/connect.facebook.net/**", route => route.abort());
    await page.addInitScript(({ runtime }) => {
      Object.defineProperty(navigator,"webdriver",{ get: () => false });
      localStorage.setItem("ccr:native-first-run-onboarding:v12","1");
      localStorage.setItem("contratacr:analytics-consent","declined");
      if (runtime !== "web") {
        const bridge: Record<string,unknown> = { isNativePlatform: () => true, getPlatform: () => runtime };
        Object.defineProperty(window,"Capacitor", { configurable: true, get: () => bridge, set: value => {
          if (value && typeof value === "object") Object.assign(bridge,value);
          bridge.isNativePlatform = () => true; bridge.getPlatform = () => runtime;
        } });
      }
    }, { runtime });
    await page.goto("/como-funciona");
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    const latest = requests.at(-1)!;
    expect(latest.cookie).toContain(`ccr_platform=${runtime === "web" ? "web" : "native"}`);
    if (runtime === "web") {
      const device = await page.evaluate(() => ({ ua: navigator.userAgent, touch: navigator.maxTouchPoints }));
      expect(latest.cookie).toContain(`ccr_web_device=${webDeviceCategory(device.ua, device.touch)}`);
      expect((latest.body as { firstUse?: boolean }).firstUse).toBe(false);
    }
    if (runtime !== "web") expect(latest.cookie).toContain(`ccr_native_os=${runtime}`);
    expect(latest.body.path).toBe("/como-funciona");
    const count = requests.length;
    await page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); document.dispatchEvent(new Event("visibilitychange")); });
    await page.waitForTimeout(200);
    expect(requests.length).toBe(count);
  });
}

test("analytics resolves the authenticated actor and excludes admins or unknown roles", async () => {
  const source = ts.transpileModule(readFileSync("src/lib/analytics/admin-activity.ts", "utf8"), { fileName: "usage-capture.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  type Actor = { id: string | null; excluded: boolean; administrator: boolean };
  const box = { exports: {} as { analyticsActor: (id?: string | null) => Promise<Actor> } };
  let sessionUser: { id: string } | null = { id: "admin-account" };
  let failed = false;
  let reads = 0;
  const profiles = { select: () => profiles, eq: (_field: string, id: string) => ({ maybeSingle: async () => {
    reads++;
    return { data: failed ? null : { role: id === "admin-account" ? "admin" : "client" }, error: failed ? { message: "unavailable" } : null };
  } }) };
  const mocks: Record<string, unknown> = {
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: () => profiles }) },
    "@/lib/supabase/server": { createClient: async () => ({}) },
    "@/lib/supabase/get-user": { safeGetUser: async () => sessionUser },
  };
  runInNewContext(source, { module: box, exports: box.exports, require: (name: string) => mocks[name] });
  expect(await box.exports.analyticsActor()).toEqual({ id: "admin-account", excluded: true, administrator: true });
  expect(await box.exports.analyticsActor("client-account")).toEqual({ id: "client-account", excluded: false, administrator: false });
  const previousReads = reads;
  sessionUser = null;
  expect(await box.exports.analyticsActor()).toEqual({ id: null, excluded: false, administrator: false });
  expect(await box.exports.analyticsActor(null)).toEqual({ id: null, excluded: false, administrator: false });
  expect(reads).toBe(previousReads);
  failed = true;
  expect(await box.exports.analyticsActor("client-account")).toEqual({ id: "client-account", excluded: true, administrator: false });
});

for (const [name, ua, touch, expected] of [
  ["Windows computer", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0, "desktop"],
  ["Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0, "desktop"],
  ["iPad desktop UA", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5, "mobile"],
  ["iPhone browser and home-screen web app", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5, "mobile"],
  ["Android phone", "Mozilla/5.0 (Linux; Android 15) Mobile", 5, "mobile"],
  ["Android tablet", "Mozilla/5.0 (Linux; Android 15)", 5, "mobile"],
  ["unknown", "", 0, "unknown"],
] as const) {
  test(`device classification: ${name}`, () => {
    expect(webDeviceCategory(ua, touch)).toBe(expected);
  });
}
test("only native runtimes can produce first app uses", () => {
  for (const runtime of ["web", "web_mobile", "web_desktop", "unknown"]) expect(isNativeAnalyticsRuntime(runtime)).toBe(false);
  for (const runtime of ["ios", "android", "native_unknown"]) expect(isNativeAnalyticsRuntime(runtime)).toBe(true);
  expect(analyticsPlatform(() => null).runtime).toBe("web");
});
