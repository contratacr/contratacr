import { test } from "playwright/test";
import { loginAs } from "./helpers";
import * as fs from "fs";

/**
 * AUDITORÍA DE PARPADEOS. Temporal.
 * Mira la pantalla cuadro a cuadro durante una RECARGA y anota, para cada
 * elemento fijo (botones, enlaces, campos, imágenes), cuándo aparece y cuándo
 * desaparece. Un elemento sano aparece UNA vez, en el primer cuadro con
 * contenido, y se queda.
 */
const RUTAS_PUBLICAS = ["/es", "/es/empleos", "/es/ofertas", "/es/proyectos", "/es/servicios", "/es/buscar", "/es/ayuda", "/es/como-funciona"];
const RUTAS_PANEL = ["/es/dashboard/profesional", "/es/dashboard/profesional?tab=jobs", "/es/dashboard/profesional?tab=offers", "/es/dashboard/profesional?tab=profile", "/es/dashboard/profesional?tab=services", "/es/notificaciones"];

const sonda = () => {
  type Reg = { primero: number; visible: boolean; cambios: number; ultimo: number; firma: string };
  const w = window as unknown as { __reg: Map<string, Reg>; __t0: number | null; __cls: number };
  w.__reg = new Map(); w.__t0 = null; w.__cls = 0;
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) w.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  } catch { /* nada */ }
  const firmaDe = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    const txt = (el.getAttribute("aria-label") || (el as HTMLInputElement).placeholder || (el.textContent || "").trim() || (el as HTMLImageElement).alt || "").replace(/\s+/g, " ").slice(0, 40);
    const src = tag === "img" ? ((el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src || "").split("/").pop()?.slice(0, 24) : "";
    const zona = el.closest("header") ? "BARRA" : el.closest("footer") ? "PIE" : "CUERPO";
    return `${zona}|${tag}|${txt}|${src}`;
  };
  const mirar = () => {
    const ahora = performance.now();
    const vistos = new Set<string>();
    document.querySelectorAll("header button, header a, header input, header img, main button, main a, main input, main img, main h1, main h2").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05) return;
      vistos.add(firmaDe(el));
    });
    if (vistos.size > 0 && w.__t0 === null) w.__t0 = ahora;
    vistos.forEach((f) => {
      const r = w.__reg.get(f);
      if (!r) w.__reg.set(f, { primero: ahora, visible: true, cambios: 1, ultimo: ahora, firma: f });
      else if (!r.visible) { r.visible = true; r.cambios++; r.ultimo = ahora; }
    });
    w.__reg.forEach((r, f) => { if (r.visible && !vistos.has(f)) { r.visible = false; r.cambios++; r.ultimo = ahora; } });
    requestAnimationFrame(mirar);
  };
  requestAnimationFrame(mirar);
};

async function auditar(page: import("playwright/test").Page, ruta: string, quien: string, salida: string[]) {
  await page.goto(ruta);
  await page.waitForTimeout(1500);
  await page.reload();                 // «al refrescar», que es como lo ve Isaac
  await page.waitForTimeout(5500);
  const r = await page.evaluate(() => {
    const w = window as unknown as { __reg: Map<string, { primero: number; visible: boolean; cambios: number; ultimo: number; firma: string }>; __t0: number | null; __cls: number };
    const t0 = w.__t0 ?? 0;
    const filas = Array.from(w.__reg.values()).map((x) => ({ ...x, tarde: Math.round(x.primero - t0) }));
    return {
      cls: w.__cls,
      tardios: filas.filter((x) => x.tarde > 120 && x.visible && x.cambios === 1).sort((a, b) => b.tarde - a.tarde).slice(0, 14),
      parpadeos: filas.filter((x) => x.cambios >= 3).slice(0, 10),
      fugaces: filas.filter((x) => !x.visible && x.cambios === 2).slice(0, 10),
    };
  });
  salida.push(`\n## ${quien} · ${ruta}   (CLS ${r.cls.toFixed(3)})`);
  if (!r.tardios.length && !r.parpadeos.length && !r.fugaces.length) salida.push("   limpio");
  r.parpadeos.forEach((x) => salida.push(`   PARPADEA ×${x.cambios}  ${x.firma}`));
  r.fugaces.forEach((x) => salida.push(`   APARECE Y SE VA  ${x.firma}`));
  r.tardios.forEach((x) => salida.push(`   TARDE +${x.tarde}ms  ${x.firma}`));
}

test("auditoría · sin sesión", async ({ page }, info) => {
  test.setTimeout(900_000);
  await page.addInitScript(sonda);
  const salida: string[] = [`# ${info.project.name} · SIN SESIÓN`];
  for (const ruta of RUTAS_PUBLICAS) await auditar(page, ruta, "anónimo", salida);
  fs.writeFileSync(`/tmp/ccr-auditoria-${info.project.name}-anonimo.md`, salida.join("\n"));
});

test("auditoría · profesional", async ({ page }, info) => {
  test.setTimeout(900_000);
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD || "");
  await page.addInitScript(sonda);
  const salida: string[] = [`# ${info.project.name} · PROFESIONAL`];
  for (const ruta of [...RUTAS_PUBLICAS.slice(0, 5), ...RUTAS_PANEL]) await auditar(page, ruta, "pro", salida);
  fs.writeFileSync(`/tmp/ccr-auditoria-${info.project.name}-pro.md`, salida.join("\n"));
});
