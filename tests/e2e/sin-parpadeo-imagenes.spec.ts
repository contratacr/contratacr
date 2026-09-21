import { expect, test } from "playwright/test";

/**
 * UNA IMAGEN QUE PUSO EL SERVIDOR NO SE APAGA AL HIDRATAR.
 *
 * `ProgressiveImage` funde las fotos en vez de soltarlas de golpe. Para eso, al
 * hidratar, escondía toda imagen que todavía no hubiera terminado de llegar y
 * la encendía al cargar. En local nunca se nota —las imágenes llegan antes que
 * la hidratación—, pero con la red de verdad la hidratación cae a mitad de la
 * descarga: la foto que el navegador ya estaba pintando se apagaba y volvía
 * 260 ms después. Visible, se va, vuelve: dos parpadeos por foto, en cada
 * recarga.
 *
 * Aquí se retrasan las imágenes a propósito para que la hidratación llegue
 * primero, y se vigila la opacidad cuadro a cuadro: tiene que ser 1 siempre.
 */
test("las fotos de la lista no se apagan al hidratar con red lenta", async ({ page }) => {
  test.setTimeout(180_000);

  // Las imágenes tardan más que la hidratación, como en producción.
  await page.route(/\.(png|jpe?g|webp|avif)(\?|$)|res\.cloudinary\.com/i, async (ruta) => {
    await new Promise((r) => setTimeout(r, 900));
    await ruta.continue();
  });

  await page.addInitScript(() => {
    const w = window as unknown as { __opacidades: Record<string, number[]> };
    w.__opacidades = {};
    const mirar = () => {
      document.querySelectorAll<HTMLImageElement>("main img").forEach((img) => {
        const r = img.getBoundingClientRect();
        if (r.width < 8 || r.top > innerHeight || r.bottom < 0) return;
        const clave = (img.alt || img.src.split("/").pop() || "").slice(0, 40);
        (w.__opacidades[clave] ||= []).push(parseFloat(getComputedStyle(img).opacity));
      });
      requestAnimationFrame(mirar);
    };
    requestAnimationFrame(mirar);
  });

  await page.goto("/es/empleos");
  await page.waitForTimeout(4500);

  const opacidades = await page.evaluate(() => (window as unknown as { __opacidades: Record<string, number[]> }).__opacidades);
  const fotos = Object.entries(opacidades);
  expect(fotos.length, "tiene que haber fotos en la lista de empleos").toBeGreaterThan(0);

  const apagadas = fotos
    .filter(([, serie]) => Math.min(...serie) < 0.99)
    .map(([nombre, serie]) => `${nombre} (bajó a ${Math.min(...serie).toFixed(2)})`);

  expect(apagadas, `fotos que se apagaron al hidratar: ${apagadas.join(", ")}`).toEqual([]);
});
