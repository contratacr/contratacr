import { test, expect } from "playwright/test";
import { apiJson, loginAs, resetAuth } from "./helpers";
import { E2E_USERS } from "./seed";

const profile = { views: 128, whatsapp: 12, calls: 4 };

test("shows only the profile when the account has no publications", async ({ page }) => {
  await page.route("**/api/dashboard/activity?days=*", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ profile, projects: [], jobs: [], offers: [] }),
  }));
  await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
  await page.goto("/dashboard/profesional?tab=statistics");
  const panel = page.getByTestId("statistics-panel");
  await expect(panel.getByRole("heading", { name: "Tu perfil" })).toBeVisible();
  await expect(panel.getByText("Visitas al perfil")).toBeVisible();
  await expect(panel.getByText("128", { exact: true })).toBeVisible();
  await expect(panel.locator("[data-status-filter-tabs]")).toHaveCount(0);
  await expect(panel.getByText("Vista previa · datos de ejemplo")).toHaveCount(0);
});

test("filters only categories with publications and changes period", async ({ page }) => {
  await page.route("**/api/dashboard/activity?days=*", route => {
    const days = new URL(route.request().url()).searchParams.get("days");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile: days === "7" ? { views: 31, whatsapp: 3, calls: 1 } : profile,
        projects: [{ id: "project-1", title: "Remodelación de cocina", views: 76, whatsapp: 8 }],
        jobs: [],
        offers: [{ id: "offer-1", title: "Mantenimiento de aire acondicionado", views: 92, whatsapp: 11 }],
      }),
    });
  });
  await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
  await page.goto("/dashboard/profesional?tab=statistics");
  const panel = page.getByTestId("statistics-panel");
  await expect(panel.getByRole("heading", { name: "Resumen de actividad" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Proyectos", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Promociones", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Empleos", exact: true })).toHaveCount(0);
  await panel.getByRole("combobox", { name: "Período" }).selectOption("7");
  await expect(panel.getByText("31", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Promociones", exact: true }).click();
  await expect(panel.getByText("Mantenimiento de aire acondicionado")).toBeVisible();
  await expect(panel.getByText("Remodelación de cocina")).not.toBeVisible();
});

test("activity endpoint requires an account and returns only owned publication groups", async ({ page }) => {
  await page.goto("/");
  expect((await apiJson(page, "/api/dashboard/activity?days=30")).status).toBe(401);
  await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
  expect((await apiJson(page, "/api/dashboard/activity?days=1")).status).toBe(400);
  const result = await apiJson<Record<string, unknown>>(page, "/api/dashboard/activity?days=30");
  expect(result.status).toBe(200);
  expect(result.body).toHaveProperty("profile");
  expect(Array.isArray(result.body.projects)).toBe(true);
  expect(Array.isArray(result.body.jobs)).toBe(true);
  expect(Array.isArray(result.body.offers)).toBe(true);
  await resetAuth(page);
  expect((await apiJson(page, "/api/dashboard/activity?days=30")).status).toBe(401);
});
