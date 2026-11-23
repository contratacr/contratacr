import { expect, test } from "playwright/test";

// Pro launch flag (PRO_ENABLED): the former development-only locks of the Pro routes and pages are now this one flag.
// OFF (production default, E2E_PRO_OFF=1): every sampled Pro API and page answers 404, exactly as before.
// ON (local development or the isolated test Worker): the same routes are reachable but still enforce the server-side
// session: an anonymous request is never served Pro data (401/403 or a redirect to sign in), and never a server error.
// The mode is read from the running server itself (E2E_PRO_OFF=1 forces OFF): the point is that the flag closes or opens
// ALL sampled routes together, never a mix.
let PRO_OFF = process.env.E2E_PRO_OFF === "1";
const apis = ["/api/pro/access", "/api/pro/cost-codes?view=library", "/api/pro/work-tasks", "/api/pro/team", "/api/pro/task-center"];
const pages = ["/es/dashboard/pro", "/es/pagar", "/es/dashboard/subcontratista", "/es/admin/pro"];

test.describe("@pro-flag gating", () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const context = await playwright.request.newContext({ baseURL });
    const probe = await context.get("/api/pro/access", { maxRedirects: 0 });
    PRO_OFF = PRO_OFF || probe.status() === 404;
    await context.dispose();
  });
  for (const path of apis) {
    test(`API ${path} ${PRO_OFF ? "is closed (404)" : "requires a session"}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      if (PRO_OFF) {
        expect(response.status()).toBe(404);
      } else {
        expect([401, 403, 307, 308]).toContain(response.status());
      }
    });
  }
  for (const path of pages) {
    test(`page ${path} ${PRO_OFF ? "is closed (404)" : "never renders Pro data anonymously"}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      if (PRO_OFF) {
        expect(response.status()).toBe(404);
      } else {
        expect(response.status()).toBeLessThan(500);
        const body = response.status() === 200 ? await response.text() : "";
        expect(body).not.toMatch(/pro_memberships|service_role/i);
      }
    });
  }
});
