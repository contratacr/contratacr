import { expect, test } from "playwright/test";

test.describe("@smoke public APIs", () => {
  test("service suggestions return matching services", async ({ request }) => {
    const response = await request.get("/api/search/suggestions?q=plomeria");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(JSON.stringify(body)).toMatch(/plomer/i);
  });

  test("approved service catalog exposes labels", async ({ request }) => {
    const response = await request.get("/api/categories/approved");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.categories)).toBe(true);
    expect(body.categories.length).toBeGreaterThan(0);
    expect(body.categories[0]).toEqual(expect.objectContaining({ label: expect.any(String) }));
  });
});
