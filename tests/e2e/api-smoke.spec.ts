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

  test("approved service catalog exposes labels", async ({ request }) => {
    const response = await request.get("/api/categories/approved");
    expect(response.status()).toBe(200);

    const body = await expectJson(response);
    expect(Array.isArray(body.categories)).toBe(true);
    expect(body.categories.length).toBeGreaterThan(0);
    expect(body.categories[0]).toEqual(expect.objectContaining({ label: expect.any(String) }));
  });
});
