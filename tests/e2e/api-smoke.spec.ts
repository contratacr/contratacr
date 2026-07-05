import { expect, test, type APIResponse } from "playwright/test";

async function expectJson(response: APIResponse) {
  const text = await response.text();
  expect(text, "API should not return an HTML protection/login page").not.toMatch(/<!DOCTYPE|Log in to Vercel/i);
  return JSON.parse(text);
}

test.describe("@smoke public APIs", () => {
  test("service suggestions return matching services", async ({ request }) => {
    const response = await request.get("/api/search/suggestions?q=plomeria");
    expect(response.status()).toBe(200);

    const body = await expectJson(response);
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(JSON.stringify(body)).toMatch(/plomer/i);
  });

  test("service suggestions keep current catalog labels and avoid raw fallbacks", async ({ request }) => {
    const response = await request.get("/api/search/suggestions?q=dise%C3%B1o&locale=es");
    expect(response.status()).toBe(200);

    const body = await expectJson(response);
    expect(Array.isArray(body.suggestions)).toBe(true);
    const labels = body.suggestions.map((item: { label?: string }) => item.label).filter(Boolean);
    expect(labels).toContain("Diseño y arte");
    expect(labels.join("|")).not.toMatch(/Diseño\s*\/\s*Arte|Diseno|categories\./i);
  });

  test("approved service catalog exposes labels", async ({ request }) => {
    const response = await request.get("/api/categories/approved");
    expect(response.status()).toBe(200);

    const body = await expectJson(response);
    expect(Array.isArray(body.categories)).toBe(true);
    expect(body.categories.length).toBeGreaterThan(0);
    expect(body.categories[0]).toEqual(expect.objectContaining({ label: expect.any(String) }));

    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/\b(?:servicesPage|categoriesPage|clientActivity|schedule|categories)\.[A-Za-z0-9_.-]+/i);

    const design = body.categories.find((category: { id?: string }) => category.id === "diseno");
    expect(design).toEqual(expect.objectContaining({ label: "Diseño y arte" }));

    const web = body.categories.find((category: { id?: string }) => category.id === "desarrollo_web");
    expect(web).toEqual(expect.objectContaining({ supportsVideoconsulta: true }));
  });

  test("insurer suggestions stay disabled while the curated insurer list is closed", async ({ request }) => {
    const response = await request.post("/api/insurers/suggest", {
      data: { name: "Aseguradora E2E" },
    });
    expect(response.status()).toBe(410);

    const body = await expectJson(response);
    expect(body.error).toMatch(/aseguradoras.*no estan habilitadas/i);
  });
});
