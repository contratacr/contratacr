import { test, expect } from "playwright/test";
import { directoryEnabled, isMobileProject } from "./helpers";

// Owner report 2026-11-27 (iPhone): «cuando entro a /buscar hay mucho parpadeo». Two causes, both fixed:
// - Directory on: the map screens hide the navbar from the first paint, but the header height the map and the results
//   sheet are sized by stayed at the navbar's 124px until hydration; then the floating card set 0px and the map, the
//   sheet and every card jumped 124px (CLS 0.15). globals.css now sets it to 0 from the first paint on those screens.
// - Pro on: each search card painted «Consultando horarios…» and only after hydration grew into the WhatsApp/call
//   buttons (every card jumped ~70px). The contact buttons are now server-painted while availability is checked.
// The header and the results sheet must stand where the first paint put them, and the page must not shift.
const PATHS = [
  { path: "/buscar", directoryOnly: false },
  { path: "/restaurantes", directoryOnly: true },
  // A search that opens with the sheet extended: it used to land ~85px low and re-snap (0px header read as 124).
  { path: "/profesionales/plomeria/alajuela", directoryOnly: false },
];

for (const { path, directoryOnly } of PATHS) {
  test(`${path}: header and results sheet keep their first-paint place after hydration, no layout shift`, async ({ page, request }, testInfo) => {
    test.skip(!isMobileProject(testInfo), "The floating card and the results sheet are the phone layout.");
    const directory = await directoryEnabled(request);
    test.skip(directoryOnly && !directory, "Business sections exist only with the directory on.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      const w = window as unknown as { __firstBoxes: Record<string, number[]>; __shifts: { value: number; sources: string[] }[] };
      w.__firstBoxes = {};
      w.__shifts = [];
      try {
        new PerformanceObserver(list => {
          for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean; sources?: { node?: Node | null }[] }[]) {
            if (entry.hadRecentInput) continue;
            w.__shifts.push({ value: entry.value, sources: (entry.sources ?? []).map(source => {
              const node = source.node;
              const element = node && node.nodeType === 1 ? node as Element : node?.parentElement;
              // The map library's own attribution control folds itself a moment after the tiles load; it is a corner
              // of the map under the sheet, not the header, the sheet or a card.
              return element?.closest(".maplibregl-control-container") ? "map-control" : "page";
            }) });
          }
        }).observe({ type: "layout-shift", buffered: true });
      } catch { /* WebKit has no layout-shift entries; the boxes below still apply. */ }
      const selectors = { header: "[data-quick-nav], [data-testid='landing-navbar']", sheet: ".ccr-search-bottom-sheet" };
      const sample = () => {
        for (const [name, selector] of Object.entries(selectors)) {
          if (w.__firstBoxes[name]) continue;
          const element = [...document.querySelectorAll(selector)].find(item => (item as HTMLElement).getClientRects().length > 0 && getComputedStyle(item).display !== "none");
          if (!element) continue;
          const box = element.getBoundingClientRect();
          w.__firstBoxes[name] = [box.left, box.top, box.width, box.height].map(Math.round);
        }
        if (Object.keys(w.__firstBoxes).length < 2) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.goto(path, { waitUntil: "commit" });
    await expect.poll(() => page.evaluate(() => Object.keys((window as unknown as { __firstBoxes: object }).__firstBoxes).length), { timeout: 30_000 }).toBe(2);
    // Hydrated: the floating card marks the body (directory on); the production navbar marks itself (off).
    await expect(directory ? page.locator("body.ccr-dir-header") : page.getByTestId("landing-navbar").first()).toHaveCount(1, { timeout: 30_000 });
    if (!directory) await expect(page.getByTestId("landing-navbar").first()).toHaveAttribute("data-hydrated", "true", { timeout: 30_000 });
    await page.waitForLoadState("load");
    await page.waitForTimeout(1_500);
    const result = await page.evaluate(() => {
      const w = window as unknown as { __firstBoxes: Record<string, number[]>; __shifts: { value: number; sources: string[] }[] };
      const now = (selector: string) => {
        const element = [...document.querySelectorAll(selector)].find(item => (item as HTMLElement).getClientRects().length > 0 && getComputedStyle(item).display !== "none");
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return [box.left, box.top, box.width, box.height].map(Math.round);
      };
      return {
        first: w.__firstBoxes,
        hydrated: { header: now("[data-quick-nav], [data-testid='landing-navbar']"), sheet: now(".ccr-search-bottom-sheet") },
        pageShift: w.__shifts.filter(shift => shift.sources.length === 0 || shift.sources.some(source => source === "page")).reduce((sum, shift) => sum + shift.value, 0),
      };
    });
    expect(result.hydrated.header, "header after hydration").toEqual(result.first.header);
    expect(result.hydrated.sheet, "results sheet after hydration").toEqual(result.first.sheet);
    expect(result.pageShift, "layout shift of the page while it loads").toBeLessThan(0.005);
  });
}
