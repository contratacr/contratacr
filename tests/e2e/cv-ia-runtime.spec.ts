import { expect, test } from "playwright/test";
import { loginAs } from "./helpers";

/**
 * DUEÑO DE /api/cv/ai/{adaptar,mejorar,carta} (20-nov-2026).
 * Sin sesión no se llama al modelo; con sesión, un cuerpo mal formado se
 * rechaza antes de gastar, y sin el binding de Workers AI (next start en CI)
 * la respuesta es «no_disponible», que el editor muestra sin romperse.
 * Lo que valida lo que devuelve el modelo está en cv-documento.spec.ts.
 */
const RUTAS = ["adaptar", "mejorar", "carta"] as const;
const OFERTA = "Hotel Atenas busca Electricista de mantenimiento con técnico del INA, cinco años de experiencia y lectura de planos.";
const CV = { idioma: "es", titular: "Electricista", resumen: "Electricista residencial.", experiencia: [], educacion: [], habilidades: [], sugeridas: [], certificaciones: [], idiomas: [] };
const CUERPOS = {
  adaptar: { cv: CV, oferta: OFERTA },
  mejorar: { texto: "Instalé el sistema eléctrico de 40 casas", tipo: "logros", idioma: "es", contexto: "Electricista" },
  carta: { cv: CV, oferta: OFERTA, puesto: "Electricista", empresa: "Hotel Atenas", destinatario: "" },
};

test("la IA del CV pide sesión", async ({ request }) => {
  for (const r of RUTAS) {
    const res = await request.post(`/api/cv/ai/${r}`, { data: CUERPOS[r] });
    expect(res.status(), r).toBe(401);
    expect(await res.json()).toEqual({ error: "sesion" });
  }
});

test("con sesión: cuerpo inválido se rechaza y sin Workers AI responde no_disponible", async ({ page }) => {
  test.skip(!process.env.E2E_TEST_PASSWORD, "Requiere la cuenta de pruebas.");
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD || "");
  const invalido = await page.request.post("/api/cv/ai/adaptar", { data: { cv: CV, oferta: "corta" } });
  expect(invalido.status()).toBe(400);
  for (const r of RUTAS) {
    const res = await page.request.post(`/api/cv/ai/${r}`, { data: CUERPOS[r] });
    expect(res.status(), r).toBe(503);
    expect(await res.json()).toEqual({ error: "no_disponible" });
  }
});
