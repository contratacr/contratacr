import { expect, test } from "playwright/test";

// Dos parpadeos que Isaac vio en su propia ficha:
//  - la fila de pestañas nacía con 5 y pasaba a 7 («Promociones» y «Empleos»
//    llegaban con la consulta del navegador) y todo lo de al lado se corría;
//  - la foto de perfil arrancaba en opacidad 0 y subía, por una animación de
//    CSS que revelaba TODA foto en cada carga, viniera o no ya pintada.
const FICHA = "/es/profesionales/redes-bahia-pruebas";

test("@seeded la fila de pestañas no cambia después de cargar", async ({ page, request }) => {
  // Lo que pinta el servidor tiene que ser ya la lista completa.
  const html = await (await request.get(FICHA)).text();
  const delServidor = [...html.matchAll(/role="tab"[^>]*>([^<]{2,40})</g)].map((m) => m[1]);
  expect(delServidor.length, "el servidor tiene que pintar todas las pestañas").toBeGreaterThan(5);

  await page.goto(FICHA);
  const tira: string[] = [];
  for (let i = 0; i < 20; i++) {
    tira.push(await page.evaluate(() => [...document.querySelectorAll("[role=tab]")].map((t) => (t as HTMLElement).innerText.trim()).join(",")));
    await page.waitForTimeout(90);
  }
  const distintos = [...new Set(tira)];
  expect(distintos, `la fila cambió: ${distintos.join(" → ")}`).toHaveLength(1);
});

test("@seeded la foto de perfil no se esconde para volver a aparecer", async ({ page }) => {
  // Con la red de verdad: la hidratación cae a mitad de la descarga.
  await page.route(/\.(png|jpg|jpeg|webp|avif)(\?|$)|res\.cloudinary\.com/i, async (ruta) => {
    await new Promise((r) => setTimeout(r, 900));
    await ruta.continue();
  });
  await page.goto(FICHA);
  const opacidades: string[] = [];
  for (let i = 0; i < 24; i++) {
    opacidades.push(await page.evaluate(() => {
      const img = [...document.querySelectorAll("img")].find((i) => i.getBoundingClientRect().width > 40);
      return img ? getComputedStyle(img).opacity : "-";
    }));
    await page.waitForTimeout(90);
  }
  const atenuadas = opacidades.filter((o) => o !== "-" && Number(o) < 0.99);
  expect(atenuadas, `la foto se atenuó: ${opacidades.join(" ")}`).toEqual([]);
});
