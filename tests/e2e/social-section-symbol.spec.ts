import { E2E_USERS } from "./seed";
import { test, expect } from "playwright/test";

test("section links describe their content and preserve individual cards", async ({ request, page }) => {
  const generic = await request.get("/es/opengraph-image");
  expect(generic.ok()).toBeTruthy();
  const symbol = await generic.body();
  const bounds = await page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    const {data} = context.getImageData(0, 0, canvas.width, canvas.height);
    let left=canvas.width, right=0, top=canvas.height, bottom=0;
    for (let y=0; y<canvas.height; y++) for(let x=0; x<canvas.width; x++) {
      const i=(y*canvas.width+x)*4;
      if (Math.min(data[i],data[i+1],data[i+2])<235) {left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    }
    return {left,right,top,bottom};
  }, symbol.toString("base64"));
  expect(Math.abs((bounds.left+bounds.right)/2-600)).toBeLessThan(12);
  expect(Math.abs((bounds.top+bounds.bottom)/2-315)).toBeLessThan(12);
  expect(bounds.left).toBeGreaterThan(300); expect(bounds.right).toBeLessThan(900);
  expect(bounds.top).toBeGreaterThan(60); expect(bounds.bottom).toBeLessThan(570);
  for (const section of ["profesionales", "empleos", "promociones", "proyectos", "publicar-proyecto", "cotizar"]) {
    const image = await request.get(`/es/${section}/opengraph-image`);
    expect(image.ok(), section).toBeTruthy();
    expect(image.headers()["content-type"]).toContain("image/png");
    expect((await image.body()).equals(symbol), section).toBe(section === "profesionales");
  }
  for (const path of [`/es/profesionales/${E2E_USERS.professional.slug}/opengraph-image`, "/es/empleos/d4000000-0000-4000-8000-000000000005/opengraph-image"]) {
    const image = await request.get(path);
    expect(image.ok()).toBeTruthy(); expect((await image.body()).equals(symbol)).toBe(false);
  }
  const sectionPage = await request.get("/empleos", { headers: { "User-Agent": "facebookexternalhit/1.1" } });
  const html = await sectionPage.text();
  expect(html).toContain("/empleos/opengraph-image");
  expect(html).toContain("Explora vacantes en Costa Rica");
  expect(html).toMatch(/property="og:image"/);
});
