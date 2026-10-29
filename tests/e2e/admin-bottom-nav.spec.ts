import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test } from "playwright/test";
import { sinBarraDeAbajo } from "../../src/lib/rutas-sin-barra";

function adminPages(dir = "src/app/[locale]/admin", route = "/admin"): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return adminPages(join(dir, entry.name), `${route}/${entry.name.replace(/\[([^\]]+)\]/g, "example")}`);
    return entry.name === "page.tsx" ? [route] : [];
  });
}

test("every admin page excludes the bottom nav before and after hydration", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const raw = layout.match(/__html: `(document\.documentElement\.classList\.add\("ccr-js"\);[\s\S]*?)`,/)![1];
  const boot = new Function("DIRECCIONES_POR_TRAMO", `return \`${raw}\`;`)("{}");
  const routes = adminPages();
  expect(routes.length).toBeGreaterThan(10);
  for (const path of [...routes, "/admin/any/future/section"]) {
    for (const prefix of ["", "/es", "/en"]) {
      const pathname = `${prefix}${path}`;
      expect(sinBarraDeAbajo(pathname), pathname).toBe(true);
      const root = new Set(["ccr-native-app", "ccr-native-bottom-nav-visible"]);
      const body = new Set(["ccr-native-bottom-nav-visible"]);
      const classList = (set: Set<string>) => ({ add: (c: string) => set.add(c), remove: (c: string) => set.delete(c), contains: (c: string) => set.has(c) });
      runInNewContext(boot, { navigator: {}, window: { location: { pathname } }, document: { documentElement: { classList: classList(root) }, body: { classList: classList(body) } } });
      expect(root.has("ccr-native-bottom-nav-visible"), pathname).toBe(false);
      expect(body.has("ccr-native-bottom-nav-visible"), pathname).toBe(false);
    }
  }
  expect(sinBarraDeAbajo("/dashboard/profesional")).toBe(false);
  expect(sinBarraDeAbajo("/administracion-publica")).toBe(false);
});

test("native admin login has no bottom nav or bottom-nav space", async ({ page, context }) => {
  await context.addCookies([{ name: "ccr_platform", value: "native", domain: "localhost", path: "/" }]);
  await page.addInitScript(() => {
    localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
    const runtime = { isNativePlatform: () => true };
    Object.defineProperty(window, "Capacitor", { configurable: true, get: () => runtime, set: () => {} });
  });
  await page.goto("/admin/login");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator("nav.ccr-native-bottom-nav")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/ccr-native-bottom-nav-visible/);
  await expect(page.locator("body")).not.toHaveClass(/ccr-native-bottom-nav-visible/);
});
