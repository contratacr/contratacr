import { expect, test } from "playwright/test";
import { isMobileProject } from "./helpers";

// Lo que se cerró lo dice, no desaparece ni miente. Un enlace de una vacante
// cerrada —compartido por WhatsApp, guardado en Google— llegaba a OTRA vacante
// con HTTP 200 y sin avisar, porque el tablero caía en `filtered[0]`.
const FANTASMA = "d4000000-0000-4000-8000-0000000fffff";

test("@seeded una dirección que no existe no enseña otra publicación", async ({ page }) => {
  test.skip(isMobileProject(test.info()), "Basta comprobarlo una vez.");
  for (const ruta of [`/es/empleos/${FANTASMA}`, `/es/ofertas/${FANTASMA}`, `/es/proyectos/${FANTASMA}`]) {
    await page.goto(ruta);
    await expect(page.locator("h1, h2").first(), `${ruta} no debe enseñar otra ficha`).toHaveText(/no encontrada|not found/i);
  }
});

test("@seeded un empleo vivo abre su ficha y se deja indexar", async ({ page, request }) => {
  test.skip(isMobileProject(test.info()), "Basta comprobarlo una vez.");
  await page.goto("/es/empleos");
  const enlaces = await page.locator('a[href*="/empleos/"]').evaluateAll((ns) => ns.map((n) => (n as HTMLAnchorElement).getAttribute("href")));
  const vivo = enlaces.find((h) => h && /[0-9a-f-]{20,}/.test(h) && !/editar|publicar|mis-/.test(h));
  expect(vivo, "el tablero sembrado trae al menos un empleo").toBeTruthy();
  await page.goto(vivo!);
  await expect(page.locator("article h2").first()).not.toHaveText("");
  // Vivo = indexable: sin la marca que apaga el buscador.
  const html = await (await request.get(vivo!)).text();
  expect(html).not.toContain('name="robots" content="noindex');
});
