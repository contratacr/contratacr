import { test } from "playwright/test";
import { gotoOK, waitForInteractivePage } from "./helpers";

// TEMPORAL (5-oct-2026): dos fallos de la exhaustiva solo se ven en la base que
// CI levanta desde cero. Esta prueba no afirma nada: deja en el registro lo que
// hace falta para entenderlos. Se borra en cuanto estén resueltos.
test("diagnóstico: copias de la ficha en la página", async ({ page }) => {
  await gotoOK(page, "/profesionales/redes-bahia-pruebas?from=%2Fprofesionales");
  for (const espera of [200, 800, 2000, 4000]) {
    await page.waitForTimeout(espera);
    const info = await page.evaluate(() => {
      const copias = [...document.querySelectorAll('[data-testid="professional-profile-name"]')].map((h) => {
        const cadena: string[] = [];
        for (let e: Element | null = h; e && e !== document.body; e = e.parentElement) {
          const cs = getComputedStyle(e);
          cadena.push(`${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""}${(e as HTMLElement).hidden ? "[hidden]" : ""}${cs.display === "none" ? "{display:none}" : ""}${e.getAttribute("style") ? `(style=${e.getAttribute("style")!.slice(0, 60)})` : ""}`);
        }
        return cadena.join(" < ");
      });
      return { url: location.pathname + location.search, mains: document.querySelectorAll("main").length, hijosDelCuerpo: [...document.body.children].filter((c) => c.tagName !== "SCRIPT").map((c) => `${c.tagName.toLowerCase()}${c.id ? `#${c.id}` : ""}${(c as HTMLElement).hidden ? `[hidden len=${c.innerHTML.length} ${c.innerHTML.slice(0, 160).replace(/\s+/g, " ")}]` : ""}`).join(" | "), copias };
    });
    console.log(`[diag-ficha +${espera}ms]`, JSON.stringify(info));
  }
});

test("diagnóstico: buscador de la portada en el teléfono", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoOK(page, "/");
  await waitForInteractivePage(page);
  const foco = () => page.evaluate(() => { const a = document.activeElement as HTMLInputElement | null; return `${a?.tagName}[${a?.getAttribute("aria-label") ?? a?.getAttribute("placeholder") ?? ""}]="${a?.value ?? ""}" opciones=${document.querySelectorAll("[role=option]").length} url=${location.pathname + location.search}`; });
  const campo = page.getByRole("combobox", { name: /Qu[eé] servicio|Qu[eé] necesitas|What service|What do you need/i }).first();
  await campo.click().catch((e) => console.log("[diag-buscador] click", String(e).slice(0, 120)));
  console.log("[diag-buscador] tras tocar:", await foco());
  await page.keyboard.type("plomeria");
  console.log("[diag-buscador] tras escribir:", await foco());
  await page.waitForTimeout(700);
  console.log("[diag-buscador] +700ms:", await foco(), "| opciones:", (await page.locator("[role=option]").allTextContents()).slice(0, 5).join(" / "));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  console.log("[diag-buscador] tras Enter 1:", await foco());
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  console.log("[diag-buscador] tras Enter 2:", await foco());
});

test("diagnóstico: qué se mueve en /profesionales de computadora", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    const w = window as unknown as { __shifts: unknown[] }; w.__shifts = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean; startTime: number; sources?: Array<{ node?: Element; previousRect: DOMRect; currentRect: DOMRect }> }>) { if (e.hadRecentInput) continue; for (const s of e.sources || []) { const n = s.node; const prev = n?.previousElementSibling; w.__shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), tag: n?.tagName, cls: String(n?.className || "").slice(0, 70), de: Math.round(s.previousRect.top), a: Math.round(s.currentRect.top), hermanoAnterior: prev ? `${prev.tagName}.${String(prev.className).slice(0, 60)} h=${Math.round(prev.getBoundingClientRect().height)} ${prev.textContent?.slice(0, 80)}` : "(ninguno)", padre: `${n?.parentElement?.tagName}.${String(n?.parentElement?.className || "").slice(0, 60)} hijos=${n?.parentElement?.children.length}` }); } } }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/profesionales"); await page.waitForTimeout(1200); await page.reload(); await page.waitForTimeout(4500);
  const hijos = await page.evaluate(() => [...document.querySelectorAll(".ccr-search-results-list > *")].map((c) => `${c.tagName}.${String(c.className).slice(0, 40)} h=${Math.round(c.getBoundingClientRect().height)} :: ${c.textContent?.replace(/\s+/g, " ").slice(0, 60)}`));
  console.log("[diag-buscar] hijos de la lista:", JSON.stringify(hijos));
  console.log("[diag-buscar] movimientos:", JSON.stringify(await page.evaluate(() => (window as unknown as { __shifts: unknown[] }).__shifts)));
});
