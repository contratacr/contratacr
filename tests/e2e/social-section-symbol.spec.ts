import { E2E_USERS } from "./seed";
import { test, expect } from "playwright/test";

test("section links describe their content and preserve individual cards", async ({ request, page }) => {
  const generic = await request.get("/es/opengraph-image");
  expect(generic.ok()).toBeTruthy();
  const symbol = await generic.body();
  // La tarjeta de marca (21-nov-2026) se ve ancha (WhatsApp) y recortada al
  // cuadrado central de 630x630 (comentarios de Facebook, ~110 px de lado): el
  // nombre y una línea de texto, grandes, viven dentro de ese cuadrado (lo oscuro
  // pasa de ~20 000 px) y los costados llevan solo adorno claro.
  expect(symbol.length, "la tarjeta general no puede ser un lienzo casi vacio (~4 KB)").toBeGreaterThan(20_000);
  const zonas = await page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    const {data} = context.getImageData(0, 0, canvas.width, canvas.height);
    let izquierda = 0, centro = 0, derecha = 0;
    for (let y=0; y<canvas.height; y++) for(let x=0; x<canvas.width; x++) {
      const i=(y*canvas.width+x)*4;
      if (data[i] < 70 && data[i+1] < 80 && data[i+2] < 110) { if (x < 285) izquierda++; else if (x > 915) derecha++; else centro++; }
    }
    return {width: canvas.width, height: canvas.height, izquierda, centro, derecha};
  }, symbol.toString("base64"));
  expect(zonas.width).toBe(1200); expect(zonas.height).toBe(630);
  expect(zonas.centro).toBeGreaterThan(12000);
  expect(zonas.izquierda).toBe(0); expect(zonas.derecha).toBe(0);
  for (const section of ["profesionales", "empleos", "promociones", "solicitudes", "publicar-solicitud", "cotizar"]) {
    const image = await request.get(`/es/${section}/opengraph-image`);
    expect(image.ok(), section).toBeTruthy();
    expect(image.headers()["content-type"]).toContain("image/png");
    const cuerpo = await image.body();
    expect(cuerpo.length, `${section}: una tarjeta en blanco pesa ~4 KB`).toBeGreaterThan(20_000);
    expect(cuerpo.equals(symbol), section).toBe(false);
  }
  for (const path of [`/es/profesionales/${E2E_USERS.professional.slug}/opengraph-image`, "/es/empleos/d4000000-0000-4000-8000-000000000005/opengraph-image"]) {
    const image = await request.get(path);
    expect(image.ok()).toBeTruthy(); expect((await image.body()).equals(symbol)).toBe(false);
  }
  const sectionPage = await request.get("/empleos", { headers: { "User-Agent": "facebookexternalhit/1.1" } });
  const html = await sectionPage.text();
  expect(html).toContain("/empleos/opengraph-image");
  expect(html).toContain("Explore vacantes en Costa Rica");
  expect(html).toMatch(/property="og:image"/);
});
