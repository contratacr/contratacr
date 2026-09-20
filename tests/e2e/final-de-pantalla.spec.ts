import { test, expect, type Page } from "playwright/test";
import { gotoOK, isMobileProject, loginAs } from "./helpers";

// EL FINAL DE UNA PANTALLA CON BOTÓN FIJO, en el teléfono. Dos reglas:
//
//  1. NADIE SE DESPLAZA HACIA LA NADA. La página reserva abajo el alto de la
//     franja; sumada a contenedores que ya se fuerzan a medir la pantalla
//     entera, una pantalla CORTA quedaba 93 px más alta que el teléfono y se
//     podía arrastrar hacia un vacío gris.
//  2. CUANDO SÍ SE DESPLAZA, el último contenido queda a la misma distancia de
//     la franja en todas partes: entre 16 y 40 px. Había de todo: 8 px en la
//     ficha de una promoción (pegado), 49 en Publicar empleo, 110 en otras.

async function medirHueco(page: Page) {
  const desplaza = await page.evaluate(() => {
    const cajas = [...document.querySelectorAll<HTMLElement>("*")].filter((n) => n.scrollHeight > n.clientHeight + 8 && /auto|scroll/.test(getComputedStyle(n).overflowY) && n.offsetHeight > 200);
    const ventana = document.documentElement.scrollHeight - window.innerHeight;
    return Math.max(ventana, ...cajas.map((n) => n.scrollHeight - n.clientHeight), 0);
  });
  (page as unknown as { __desplaza: number }).__desplaza = desplaza;
  // al final de todo lo que se desplace
  await page.evaluate(() => { window.scrollTo(0, 999999); document.querySelectorAll<HTMLElement>("*").forEach((n) => { if (n.scrollHeight > n.clientHeight + 8 && /auto|scroll/.test(getComputedStyle(n).overflowY)) n.scrollTop = 999999; }); });
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    const barra = [...document.querySelectorAll<HTMLElement>(".ccr-barra-accion, .ccr-pie-ventana")].filter((e) => e.offsetHeight > 0).sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
    if (!barra) return null;
    const tope = barra.getBoundingClientRect().top;
    const fija = getComputedStyle(barra).position === "fixed";
    // lo último con contenido de verdad que NO es la barra ni algo fijo
    let fondo = 0; let quien = "";
    const hojas = document.querySelectorAll<HTMLElement>("main p, main span, main input, main textarea, main button, main a, main img, main label, main h1, main h2, main h3, main li, main dd, [role=dialog] p, [role=dialog] input, [role=dialog] textarea, [role=dialog] button, [role=dialog] label, [role=dialog] span");
    hojas.forEach((n) => {
      if (barra.contains(n) || n.closest("footer, header, nav, [data-aviso-guardado], nextjs-portal")) return;
      const c = getComputedStyle(n); if (c.position === "fixed" || c.visibility === "hidden" || c.display === "none") return;
      let p: HTMLElement | null = n.parentElement; while (p) { if (getComputedStyle(p).position === "fixed" && !p.matches("[role=dialog], [role=dialog] *") && !p.querySelector(".ccr-barra-accion, .ccr-pie-ventana")) return; p = p.parentElement; }
      const b = n.getBoundingClientRect(); if (b.width === 0 || b.height === 0) return;
      if (b.bottom <= tope + 2 && b.bottom > fondo) { fondo = b.bottom; quien = (n.textContent ?? n.tagName).trim().slice(0, 28) || n.tagName; }
    });
    // la última CAJA blanca (tarjeta o sección a sangre) sobre un lienzo gris
    let caja = 0;
    document.querySelectorAll<HTMLElement>("main *, [role=dialog] *").forEach((n) => {
      if (barra.contains(n) || n.closest("footer, header, nav")) return;
      const c = getComputedStyle(n); if (c.backgroundColor !== "rgb(255, 255, 255)" || c.position === "fixed") return;
      const b = n.getBoundingClientRect(); if (b.height < 60 || b.width < 250) return;
      if (b.bottom <= tope + 2 && b.bottom > caja) caja = b.bottom;
    });
    return { fija, tope: Math.round(tope), hueco: Math.round(tope - fondo), huecoCaja: caja ? Math.round(tope - caja) : null, ultimo: quien, pantalla: window.innerHeight };
  });
}

const MIN = 16, MAX = 40;

test("el final de cada pantalla con franja: sin scroll al vacío y a la misma distancia del botón", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "La franja fija es del teléfono.");
  test.setTimeout(420_000);
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD ?? "");
  const id = async (r: string, re: RegExp) => { await gotoOK(page, r); await page.waitForTimeout(1200); return ((await page.content()).match(re) ?? [])[0]; };
  const casos: Array<[string, string | undefined, ((p: Page) => Promise<void>)?]> = [
    ["publicar empleo", "/es/empleos/publicar"],
    ["publicar promoción", "/es/ofertas/publicar"],
    ["soporte (página)", "/es/soporte"],
    ["soporte (panel)", "/es/dashboard/profesional?tab=soporte", async (p) => { await p.getByRole("button", { name: /Contactar soporte/i }).first().click(); await p.waitForTimeout(1400); }],
    ["ficha de empleo", await id("/es/empleos", /\/es\/empleos\/[0-9a-f-]{36}/)],
    ["ficha de promoción", await id("/es/ofertas", /\/es\/ofertas\/[0-9a-f-]{36}/)],
    ["ficha de proyecto", await id("/es/proyectos", /\/es\/proyectos\/[0-9a-f-]{36}/)],
    ["ficha profesional", "/es/profesionales/estudio-delta-pruebas"],
  ];
  for (const [nombre, ruta, previo] of casos) {
    if (!ruta) continue;
    await gotoOK(page, ruta); await page.waitForTimeout(2200);
    if (previo) await previo(page);
    const r = await medirHueco(page);
    const desplaza = (page as unknown as { __desplaza: number }).__desplaza;
    expect(r, `«${nombre}» perdió su franja`).not.toBeNull();
    if (desplaza <= 8) continue; // cabe en la pantalla: el espacio que sobre es natural
    // Lo que se arrastra tiene que ser CONTENIDO: al llegar al final, lo último
    // —el texto, o la tarjeta que lo envuelve— queda pegado a la franja.
    const distancia = Math.min(r!.hueco, r!.huecoCaja ?? Infinity);
    const referencia = r!.hueco <= MAX ? r!.hueco : (r!.huecoCaja ?? r!.hueco);
    expect(distancia, `«${nombre}» se desplaza ${desplaza}px y al final deja ${r!.hueco}px vacíos sobre la franja`).toBeLessThanOrEqual(MAX);
    expect(referencia, `«${nombre}»: lo último queda pegado a la franja (${referencia}px)`).toBeGreaterThanOrEqual(MIN);
  }
});
